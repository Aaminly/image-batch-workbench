import copy,json,unittest
from unittest.mock import patch
import tests.test_drafts as legacy
from drafts import DraftStore,atomic_json
from fastapi import HTTPException

class InstanceTests(unittest.TestCase):
 setUp=legacy.DraftTests.setUp
 payload=legacy.DraftTests.payload
 def test_singleton_creation(self):
  a=self.store.create();b=self.store.create();self.assertEqual(a['id'],b['id'])
 def test_history_persists_and_rejects_oversize(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png)
  states=[]
  for n in range(11):
   state=self.payload(ref);state['project']['copy']['title']=str(n);states.append(state)
  payload={**states[5],'history':states,'cursor':5}
  self.store.save(d['id'],0,payload)
  record=DraftStore(self.tmp.name).get(d['id']);self.assertEqual(len(record['history']),11);self.assertEqual(record['cursor'],5)
  with self.assertRaises(HTTPException):self.store.save(d['id'],1,{**payload,'history':states+[states[-1]]})
  self.assertEqual(self.store.get(d['id'])['revision'],1)
 def test_migration_keeps_all_batches_and_reuses_latest(self):
  latest=None
  for n in range(3):
   identifier=f'{n+1:032x}';ref=self.store.asset(self.store.create()['id'],self.png)
   r={'id':identifier,'revision':n,'updated':n,'uploads':[ref],**self.payload(ref)};atomic_json(self.store.path(identifier),r);latest=identifier
  again=DraftStore(self.tmp.name);self.assertEqual(again.create()['id'],latest);self.assertEqual(len(list(again.records.glob('*.json'))),4)
 def test_bad_latest_prevents_destructive_migration(self):
  for n in range(2):
   r={'id':f'{n+1:032x}','revision':1,'updated':n,'uploads':['a'*64],**self.payload('a'*64)};atomic_json(self.store.path(r['id']),r)
  before={p.name:p.read_bytes() for p in self.store.records.glob('*.json')}
  with self.assertRaises(HTTPException):DraftStore(self.tmp.name)
  self.assertEqual({p.name:p.read_bytes() for p in self.store.records.glob('*.json')},before)
 def test_history_retains_images_then_collects_pruned(self):
  d=self.store.create();old=self.store.asset(d['id'],self.png)
  other=self.store.asset(d['id'],self.png+b'extra');states=[self.payload(old),self.payload(other)]
  self.store.save(d['id'],0,{**states[1],'history':states,'cursor':1})
  self.assertEqual(self.store.read_asset(d['id'],old),self.png)
  self.store.save(d['id'],1,{**states[1],'history':[states[1]],'cursor':0})
  self.assertFalse((self.store.assets/old).exists());self.assertTrue((self.store.assets/other).exists())

 def test_migration_atomic_failure_preserves_old_library(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);self.store.save(d['id'],0,self.payload(ref))
  r=self.store.get(d['id']);r.update(id='f'*32,updated=r['updated']+1);atomic_json(self.store.path(r['id']),r)
  before={p.name:p.read_bytes() for p in self.store.records.glob('*.json')}
  with patch.object(self.module,'atomic_json',side_effect=OSError('disk full')):
   with self.assertRaises(HTTPException):DraftStore(self.tmp.name)
  self.assertEqual({p.name:p.read_bytes() for p in self.store.records.glob('*.json')},before);self.assertTrue((self.store.assets/ref).exists())
 def test_corrupt_latest_image_does_not_delete_older_records(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);self.store.save(d['id'],0,self.payload(ref))
  r=self.store.get(d['id']);r.update(id='e'*32,updated=r['updated']+1);atomic_json(self.store.path(r['id']),r)
  (self.store.assets/ref).write_bytes(b'bad');before={p.name:p.read_bytes() for p in self.store.records.glob('*.json')}
  with self.assertRaises(HTTPException):DraftStore(self.tmp.name)
  self.assertEqual({p.name:p.read_bytes() for p in self.store.records.glob('*.json')},before)
 def test_invalid_cursor_and_state_cannot_change_saved_history(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);state=self.payload(ref);self.store.save(d['id'],0,state)
  for patch in [{'cursor':True},{'cursor':1},{'history':[]},{'history':[{}]},{'ui':{'currentId':'missing'}}]:
   with self.assertRaises(HTTPException):self.store.save(d['id'],1,{**state,'history':[state],'cursor':0,**patch})
  self.assertEqual(self.store.get(d['id'])['revision'],1)

 def test_commit_retry_is_idempotent_and_cannot_change_content(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);payload={**self.payload(ref),'commitId':'a'*32}
  first=self.store.save(d['id'],0,payload);again=self.store.save(d['id'],0,payload);self.assertEqual(again,first)
  bad=copy.deepcopy(payload);bad['project']['copy']['title']='different'
  with self.assertRaises(HTTPException) as error:self.store.save(d['id'],0,bad)
  self.assertEqual(error.exception.status_code,409)
  with self.assertRaises(HTTPException):self.store.save(d['id'],0,{**payload,'commitId':'b'*32})
  self.assertEqual(self.store.get(d['id'])['revision'],1)
 def test_commit_token_survives_process_restart(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);payload={**self.payload(ref),'commitId':'c'*32};self.store.save(d['id'],0,payload)
  store=DraftStore(self.tmp.name);self.assertEqual(store.get(d['id'])['commitId'],'c'*32);self.assertEqual(store.save(d['id'],0,payload)['revision'],1)

 def test_other_batch_history_and_pending_images_survive_restart_and_pruning(self):
  a=self.store.create();old=self.store.asset(a['id'],self.png);current=self.store.asset(a['id'],self.png+b'current');pending=self.store.asset(a['id'],self.png+b'pending')
  states=[self.payload(old),self.payload(current)];self.store.save(a['id'],0,{**states[1],'history':states,'cursor':1})
  b=self.store.create(new_batch=True);other=self.store.asset(b['id'],self.png+b'other');self.store.save(b['id'],0,self.payload(other));self.store.save(b['id'],1,self.payload(other))
  again=DraftStore(self.tmp.name)
  for ref,data in [(old,self.png),(current,self.png+b'current'),(pending,self.png+b'pending')]:self.assertEqual(again.read_asset(a['id'],ref),data)
  self.assertEqual(again.get(a['id'])['cursor'],1);self.assertEqual(len(again.get(a['id'])['history']),2)

if __name__=='__main__':unittest.main()
