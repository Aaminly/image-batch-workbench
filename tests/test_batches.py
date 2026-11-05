import unittest
from drafts import DraftStore
from tests.test_drafts import DraftTests

class BatchTests(unittest.TestCase):
 setUp=DraftTests.setUp
 payload=DraftTests.payload
 def test_multiple_batches_survive_save_and_restart(self):
  a=self.store.create();ref=self.store.asset(a['id'],self.png);self.store.save(a['id'],0,self.payload(ref))
  b=self.store.create(new_batch=True);self.assertNotEqual(a['id'],b['id'])
  other=self.store.asset(b['id'],self.png+b'other');self.store.save(b['id'],0,self.payload(other))
  self.assertEqual(self.store.read_asset(a['id'],ref),self.png)
  again=DraftStore(self.tmp.name);self.assertEqual(len(again.list()),2);self.assertEqual(again.read_asset(a['id'],ref),self.png)
 def test_saving_other_batch_preserves_pending_uploads(self):
  a=self.store.create();pending=self.store.asset(a['id'],self.png)
  b=self.store.create(new_batch=True);ref=self.store.asset(b['id'],self.png+b'other');self.store.save(b['id'],0,self.payload(ref))
  self.assertEqual(self.store.read_asset(a['id'],pending),self.png)
 def test_deleting_one_batch_keeps_other_assets(self):
  a=self.store.create();ref=self.store.asset(a['id'],self.png);self.store.save(a['id'],0,self.payload(ref))
  b=self.store.create(new_batch=True);self.store.asset(b['id'],self.png);self.store.save(b['id'],0,self.payload(ref));self.store.delete([a['id']]);self.assertEqual(self.store.read_asset(b['id'],ref),self.png)
