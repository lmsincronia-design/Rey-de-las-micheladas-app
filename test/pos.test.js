import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import handler from '../api/pos.js';
const local='10000000-0000-4000-8000-000000000001',token='test-pos-key-for-local-only-00001';
function response(){return {statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
const request=(body={},authorization=`Bearer ${token}`)=>({method:'POST',headers:{'content-type':'application/json',authorization},body});
test('POS rejects unsupported methods and unconfigured integration',async()=>{
 let res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.statusCode,405);
 res=response();await handler({method:'POST',headers:{'content-type':'text/plain'}},res);assert.equal(res.statusCode,415);
 delete process.env.SUPABASE_SERVICE_ROLE_KEY;res=response();await handler(request(),res);assert.equal(res.statusCode,503);
});
test('per-local authentication and action allowlist protect the server credential',async()=>{
 process.env.SUPABASE_URL='https://server-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-key';process.env.POS_KEYS_JSON=JSON.stringify({[local]:createHash('sha256').update(token).digest('hex')});
 let res=response();await handler(request({local_id:'another-local',action:'sale'}),res);assert.equal(res.statusCode,401);
 res=response();await handler(request({local_id:local,action:'sale'},'Bearer incorrect-key-value-0000'),res);assert.equal(res.statusCode,401);
 res=response();await handler(request({local_id:local,action:'delete_users'}),res);assert.equal(res.statusCode,400);
 const oldFetch=globalThis.fetch;let received;
 globalThis.fetch=async(url,options)=>{received={url,options};return new Response(JSON.stringify('receipt-id'),{status:200,headers:{'content-type':'application/json'}});};
 try{res=response();await handler(request({local_id:local,action:'sale',folio:'42',amount:9000,people:1,codes:['ABCDEF123456'],redemption_code:'REDEMPTION'}),res);assert.equal(res.statusCode,200);assert.match(String(received.url),/\/rest\/v1\/rpc\/pos_record_sale/);const args=JSON.parse(received.options.body);assert.equal(args.location_value,local);assert.equal(args.redemption_code,'REDEMPTION');assert.ok(!JSON.stringify(res.body).includes('test-server-key'));}
 finally{globalThis.fetch=oldFetch;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.POS_KEYS_JSON;}
});
