import io
import unittest
from unittest.mock import patch
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fastapi import HTTPException
from fastapi.testclient import TestClient
import server


class TextCutoutTests(unittest.TestCase):
    def fixture(self):
        image = Image.new('RGBA', (480, 200), '#f0e8d8')
        d = ImageDraw.Draw(image)
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 64)
        d.text((24, 42), 'GOOD', font=font, fill='#142850', stroke_width=0)
        return image, [(24, 52, 205, 58)]

    def extract(self, image, boxes):
        from text_cutout import text_layer
        return text_layer(image, boxes)

    def test_text_matte_preserves_holes_and_removes_background(self):
        image, boxes = self.fixture()
        layer = self.extract(image, boxes)
        alpha = np.asarray(layer)[:, :, 3]
        self.assertEqual(layer.size, image.size)
        self.assertEqual(int(alpha[0, 0]), 0)
        self.assertEqual(int(alpha[75, 85]), 0)  # O counter
        self.assertGreater(np.count_nonzero(alpha), 1500)
        self.assertLess(np.count_nonzero(alpha), 8000)
        # Recomposition reproduces the original flattened text, including its edge.
        composed = Image.alpha_composite(Image.new('RGBA', image.size, '#f0e8d8'), layer)
        error = np.abs(np.asarray(composed).astype(float) - np.asarray(image).astype(float))
        self.assertLess(error.max(), 5)
        self.assertTrue(np.any((alpha > 0) & (alpha < 255)))
        rgb = np.asarray(layer)[:, :, :3][(alpha > 30) & (alpha < 220)]
        self.assertLess(np.max(np.abs(rgb.astype(float) - [20, 40, 80])), 20)

    def test_decoration_outside_ocr_box_is_not_captured_as_text(self):
        image, boxes = self.fixture()
        ImageDraw.Draw(image).ellipse((120, 46, 124, 50), fill='#00ff00')
        with self.assertRaises(HTTPException): self.extract(image, boxes)

    def test_texture_and_no_text_are_explicit_failures(self):
        image, boxes = self.fixture()
        with self.assertRaises(HTTPException): self.extract(image, [])
        pixels = np.random.default_rng(42).integers(0, 256, (200, 480, 4), dtype=np.uint8)
        pixels[:, :, 3] = 255
        with self.assertRaises(HTTPException): self.extract(Image.fromarray(pixels), boxes)

    def test_split_refuses_text_over_subject_instead_of_punching_holes(self):
        from text_cutout import compose_text_cutout
        image, boxes = self.fixture()
        layer = self.extract(image, boxes)
        with self.assertRaises(HTTPException):
            compose_text_cutout(image, Image.new('L', image.size, 255), layer, 'split')
        merged, text = compose_text_cutout(image, Image.new('L', image.size, 255), layer, 'keep')
        self.assertEqual(merged.tobytes(), image.tobytes())
        self.assertIsNone(text)

    def test_split_has_no_duplicate_text_and_keep_matches_two_layers(self):
        from text_cutout import compose_text_cutout
        image, boxes = self.fixture(); layer = self.extract(image, boxes)
        mask = Image.new('L', image.size)
        ImageDraw.Draw(mask).rectangle((320, 50, 400, 180), fill=255)
        subject, text = compose_text_cutout(image, mask, layer, 'split')
        merged, _ = compose_text_cutout(image, mask, layer, 'keep')
        self.assertEqual(Image.alpha_composite(subject, text).tobytes(), merged.tobytes())
        self.assertEqual(subject.getpixel((50, 70))[3], 0)
        self.assertEqual(subject.getpixel((350, 70))[3], 255)

    def test_a_small_overlapping_text_region_is_not_diluted_by_safe_text(self):
        from text_cutout import compose_text_cutout
        image = Image.new('RGBA', (1200, 500), '#f0e8d8')
        layer = Image.new('RGBA', image.size)
        d = ImageDraw.Draw(layer)
        for x in range(20, 1100, 20): d.rectangle((x, 20, x+5, 40), fill='black')
        d.rectangle((600, 300, 606, 320), fill='black')
        mask = Image.new('L', image.size)
        ImageDraw.Draw(mask).rectangle((580, 280, 640, 340), fill=255)
        with self.assertRaises(HTTPException): compose_text_cutout(image, mask, layer, 'split')

    def test_modes_are_validated_before_work_and_plain_png_is_compatible(self):
        client = TestClient(server.app, base_url='http://127.0.0.1:8765')
        b = io.BytesIO(); self.fixture()[0].save(b, format='PNG')
        for query in ['?mode=other', '?mode=', '?mode=split&mode=keep']:
            response = client.post('/api/cutout' + query, content=b.getvalue())
            self.assertEqual(response.status_code, 400)
        with patch.object(server, 'cutout', return_value=b.getvalue()):
            response = client.post('/api/cutout', content=b.getvalue())
            self.assertEqual(response.headers['content-type'], 'image/png')
            self.assertEqual(response.content, b.getvalue())

if __name__ == '__main__': unittest.main()
