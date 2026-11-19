"""Contracts for generation, local storage, and the localhost boundary."""
import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock
from urllib import request,error

from phlo_server.product_workspace import (
    validate_artifact,validate_workspace,build_prompt,images_from_payload,WorkspaceServer,run_codex
)

def artifact(task='diagram'):
    return {'title':'Journey','kind':task,'summary':'A supplied journey.','body':'','layout':'journey',
            'nodes':[{'id':'a','label':'Signup','detail':'','kind':'step'},{'id':'b','label':'Discovery','detail':'','kind':'step'}],
            'edges':[{'from':'a','to':'b','label':''}],'screens':[],'assumptions':[],'questions':[]}

def workspace():
    return {'format':1,'current':'doc','documents':[{'id':'doc','title':'Notes','framework':'','html':'<p>My thinking</p>','references':[],'referenceNotes':''}],'artifacts':[]}

class ArtifactTests(unittest.TestCase):
    def test_voice_long_edits_use_separate_schema(self):
        from phlo_server.product_workspace import validate_voice_response
        detail='A grounded supporting point. '*120
        edits=validate_voice_response({'edits':[{'id':'s1','label':'Update','detail':detail}]})
        self.assertEqual(edits[0]['detail'],detail)
        with self.assertRaises(ValueError):
            validate_voice_response({'edits':[{'id':'s1','label':'Update','detail':'x'*12001}]})

    def test_valid_diagram(self):
        self.assertEqual(validate_artifact(artifact(),'diagram')['nodes'][0]['label'],'Signup')
    def test_missing_and_duplicate_nodes_rejected(self):
        for mode in ['missing','duplicate']:
            data=artifact()
            if mode=='missing':data['edges'][0]['to']='unknown'
            else:data['nodes'][1]['id']='a'
            with self.assertRaises(ValueError):validate_artifact(data,'diagram')
    def test_layout_and_task_rejected(self):
        data=artifact();data['layout']='arbitrary-html'
        with self.assertRaises(ValueError):validate_artifact(data,'diagram')
        with self.assertRaises(ValueError):validate_artifact(artifact(),'wireframe')
    def test_summary_must_contain_text(self):
        data=artifact('summary');data['nodes']=[];data['edges']=[];data['layout']='text'
        with self.assertRaises(ValueError):validate_artifact(data,'summary')
        data['body']='Only summarize the supplied thinking.'
        self.assertEqual(validate_artifact(data,'summary')['body'],data['body'])
    def test_unknown_screen_target_rejected(self):
        data=artifact('wireframe');data.update(nodes=[],edges=[],layout='screens')
        screen={'id':'one','title':'Start','eyebrow':'','description':'','notice':'','fields':[],'actions':[{'label':'Next','target':'missing','style':'primary'}],'footer':''}
        data['screens']=[screen]
        with self.assertRaises(ValueError):validate_artifact(data,'wireframe')
        screen['actions'][0]['target']='@complete'
        self.assertEqual(validate_artifact(data,'wireframe')['screens'][0]['id'],'one')
    def test_prompt_preserves_selection_and_revision(self):
        data=build_prompt({'task':'diagram','selection':'Signup -> Discovery','heading':'User journey','document':'# My own framework\nThese are my notes.','instruction':'Keep both stages','previous':artifact()})
        self.assertIn('Signup -> Discovery',data);self.assertIn('My own framework',data);self.assertIn('previousDeliverable',data)
        self.assertIn('Do not silently add',data)
    def test_invalid_images_rejected(self):
        for images in [[{'data':'https://somewhere.invalid/image.png'}],[{'data':'data:image/png;base64,YmFk'}],[{}]*9]:
            with self.assertRaises(ValueError):images_from_payload({'images':images})
    def test_auth_required_before_generation(self):
        with mock.patch('phlo_server.product_workspace.shutil.which',return_value='/fake/codex'),mock.patch('phlo_server.product_workspace.codex_status',return_value={'available':True,'signedIn':False}):
            with self.assertRaisesRegex(ValueError,'Sign in'):run_codex('prompt',[])

class StorageTests(unittest.TestCase):
    def test_workspace_identifier_and_current_document(self):
        data=workspace();data['current']='missing'
        with self.assertRaises(ValueError):validate_workspace(data)
        data=workspace();data['documents'][0]['id']='bad"selector'
        with self.assertRaises(ValueError):validate_workspace(data)
    def test_no_unexpected_root_fields(self):
        data=workspace();data['api_key']='should not be saved'
        with self.assertRaises(ValueError):validate_workspace(data)
    def test_reference_and_version_round_trip(self):
        with tempfile.TemporaryDirectory() as folder,mock.patch('phlo_server.product_workspace.codex_status',return_value={'available':True,'signedIn':True}):
            path=Path(folder)/'state.json';server=WorkspaceServer(('127.0.0.1',0),path)
            data=workspace();data['artifacts']=[{'id':'artifact','docId':'doc','task':'diagram','versions':[{'data':artifact()}]}]
            revision=server.store(data,0);self.assertEqual(revision,1)
            data['documents'][0]['title']='Changed outside server'
            self.assertEqual(server.state['documents'][0]['title'],'Notes')
            with self.assertRaises(FileExistsError):server.store(data,0)
            server.server_close();reopened=WorkspaceServer(('127.0.0.1',0),path)
            self.assertEqual(reopened.revision,1);self.assertEqual(len(reopened.state['artifacts'][0]['versions']),1);reopened.server_close()
    def test_pending_request_round_trip_and_invalid_capture(self):
        data=workspace()
        data['pending']=[{'id':'request','job':'job','operation':'create','task':'metrics','capture':{'docId':'doc'}}]
        with tempfile.TemporaryDirectory() as folder,mock.patch('phlo_server.product_workspace.codex_status',return_value={'available':True,'signedIn':True}):
            path=Path(folder)/'state.json';server=WorkspaceServer(('127.0.0.1',0),path)
            server.store(data,0);server.server_close()
            reopened=WorkspaceServer(('127.0.0.1',0),path)
            self.assertEqual(reopened.state['pending'][0]['job'],'job');reopened.server_close()
        data['pending'][0]['capture']='bad'
        with self.assertRaises(ValueError):validate_workspace(data)

    def test_failed_validation_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as folder,mock.patch('phlo_server.product_workspace.codex_status',return_value={'available':True,'signedIn':True}):
            path=Path(folder)/'state.json';server=WorkspaceServer(('127.0.0.1',0),path);server.store(workspace(),0);original=path.read_bytes()
            bad=workspace();bad['artifacts']=[{'id':'bad'}]
            with self.assertRaises(ValueError):server.store(bad,1)
            self.assertEqual(path.read_bytes(),original);server.server_close()

class LocalHTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        with mock.patch('phlo_server.product_workspace.codex_status',return_value={'available':True,'signedIn':True}):
            self.server=WorkspaceServer(('127.0.0.1',0),Path(self.tmp.name)/'state.json')
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base=f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()
    def call(self,path,payload=None,token=True,origin=None):
        headers={'Content-Type':'application/json'}
        if token:headers['X-Workspace-Token']=self.server.token
        if origin:headers['Origin']=origin
        req=request.Request(self.base+path,data=json.dumps(payload).encode() if payload is not None else None,headers=headers)
        with request.urlopen(req) as response:return json.load(response)
    def test_no_token_or_foreign_origin_cannot_write(self):
        for token,origin in [(False,None),(True,'https://foreign.invalid')]:
            with self.assertRaises(error.HTTPError) as caught:self.call('/api/state',{'state':workspace(),'revision':0},token,origin)
            self.assertEqual(caught.exception.code,403)
        self.assertFalse(self.server.state_path.exists())
    def test_save_read_and_conflict(self):
        self.assertEqual(self.call('/api/state',{'state':workspace(),'revision':0})['revision'],1)
        self.assertEqual(self.call('/api/state')['state']['documents'][0]['title'],'Notes')
        with self.assertRaises(error.HTTPError) as caught:self.call('/api/state',{'state':workspace(),'revision':0})
        self.assertEqual(caught.exception.code,409)
    def test_connection_does_not_disclose_or_persist_key(self):
        self.call('/api/connection',{'provider':'gemini','key':'fake-test-key','model':'gemini-test'})
        result=self.call('/api/connection');self.assertTrue(result['geminiConfigured']);self.assertNotIn('fake-test-key',json.dumps(result));self.assertFalse(self.server.state_path.exists())
    def test_static_shell_and_health(self):
        self.assertEqual(self.call('/api/health')['app'],'product-workspace')
        with request.urlopen(self.base+'/') as response:
            text=response.read().decode();self.assertIn(self.server.token,text);self.assertIn('product-workspace.js',text)
            self.assertIn("script-src 'self'",response.headers['Content-Security-Policy'])
