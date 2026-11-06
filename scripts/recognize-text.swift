import Foundation
import Vision
import ImageIO

do {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw NSError(domain: "InvalidImage", code: 1)
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.008
    try VNImageRequestHandler(cgImage: image).perform([request])
    let boxes = (request.results ?? []).map { observation -> [Double] in
        let b = observation.boundingBox
        return [b.minX * Double(image.width), (1 - b.maxY) * Double(image.height),
                b.width * Double(image.width), b.height * Double(image.height)]
    }
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: boxes))
} catch {
    FileHandle.standardError.write(Data("Local text recognition failed: \(error)".utf8))
    exit(1)
}
