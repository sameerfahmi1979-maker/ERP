import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),refresh:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc})}));
vi.mock('next/cache',()=>({revalidatePath:m.refresh}));
import {createNumberedParty} from '@/server/numbered-party-create';
const c={operationId:'d6169331-9ba8-4d5b-b2fb-a02c77a4b752',revision:null};
const receipt={id:7,entity:'parties',reference:'F06-7',reference_id:9,operation_id:c.operationId,replayed:false,revision:'1'};
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({data:receipt,error:null});});
it('preserves the retained request and returns only the minimal public receipt',async()=>{expect(await createNumberedParty('parties',{is_active:false,latitude:0},c)).toEqual({success:true,data:{id:7,party_code:'F06-7',replayed:false,revision:'1'}});expect(m.rpc).toHaveBeenCalledWith('create_numbered_party_record',{p_entity:'parties',p_operation:c.operationId,p_data:{is_active:false,latitude:0}});});
it('requires a creation identity, not an edit revision or server-generated fallback',async()=>{for(const contract of [{...c,revision:'1'},undefined,{operationId:'bad',revision:null}])expect((await Reflect.apply(createNumberedParty,null,['parties',{},contract])).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it.each([{...receipt,id:0},{...receipt,entity:'party_notes'},{...receipt,operation_id:'cc2b99b7-229b-4e7c-bd51-882f4ca3ff31'},{...receipt,private_value:'not permitted'},null])('does not accept an incomplete, extra-field or wrong-identity receipt %#',async data=>{m.rpc.mockResolvedValue({data,error:null});expect(await createNumberedParty('parties',{},c)).toMatchObject({success:false,uncertain:true});expect(m.refresh).not.toHaveBeenCalled();});
it.each(['23505','42501','22023','P0001','PT409'])('database rejection %s stays secret-safe and authoritative',async code=>{m.rpc.mockResolvedValue({data:null,error:{code,message:'private database detail'}});const r=await createNumberedParty('parties',{},c);expect(r).toMatchObject({success:false,uncertain:false});expect(r.error).not.toContain('private');});
it('transport and thrown post-request failures retain uncertain identity',async()=>{m.rpc.mockResolvedValueOnce({error:{message:'network'}}).mockRejectedValueOnce(Error('private network detail'));for(let i=0;i<2;i++)expect(await createNumberedParty('parties',{},c)).toMatchObject({success:false,uncertain:true});});
it('cache failure after commit does not convert success into a false rejection',async()=>{m.refresh.mockImplementation(()=>{throw Error('unavailable');});expect((await createNumberedParty('parties',{},c)).success).toBe(true);});

it.each(['40003','08007','40ZZZ','57014','PGRST000','XX000',undefined,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01',40001,{}])('W16 party unknown/malformed code %j retains uncertainty',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W16_PRIVATE',details:'W16_PRIVATE',hint:'W16_PRIVATE'}});
 const result=await createNumberedParty('parties',{active:false,value:0},c);
 expect(result).toMatchObject({success:false,uncertain:true});expect(result.error).toMatch(/unconfirmed/i);expect(JSON.stringify(result)).not.toMatch(/W16_PRIVATE|rejected|committed/i);
 expect(m.rpc).toHaveBeenCalledOnce();expect(m.refresh).not.toHaveBeenCalled();
});
it.each(['40000','40001','40002','40P01','22023','23514','42501','PT409','P0001','P0002'])('W16 party definite exact code %s',async code=>{m.rpc.mockResolvedValue({error:{code}});expect(await createNumberedParty('parties',{},c)).toMatchObject({uncertain:false});});
it('W16 party keeps 55P03 outside its known set',async()=>{m.rpc.mockResolvedValue({error:{code:'55P03'}});expect(await createNumberedParty('parties',{},c)).toMatchObject({uncertain:true});});
it.each((['parties','party_contacts','party_addresses','party_bank_details','party_licenses','party_tax_registrations','party_documents','party_notes'] as const).flatMap(entity=>['40003','08007'].map(code=>({entity,code}))))('W16 exact party replay $entity after $code',async({entity,code})=>{
 const fields={parties:'party_code',party_contacts:'contact_code',party_addresses:'address_code',party_bank_details:'bank_detail_code',party_licenses:'license_code',party_tax_registrations:'tax_registration_code',party_documents:'document_code',party_notes:'note_code'} as const;
 const data={active:false,value:0};m.rpc.mockResolvedValueOnce({data:null,error:{code}}).mockResolvedValueOnce({data:{...receipt,entity,replayed:true},error:null});
 expect(await createNumberedParty(entity,data,c)).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();expect(m.refresh).not.toHaveBeenCalled();
 expect(await createNumberedParty(entity,data,c)).toEqual({success:true,data:{id:7,[fields[entity]]:'F06-7',replayed:true,revision:'1'}});
 expect(m.rpc.mock.calls[1]).toEqual(m.rpc.mock.calls[0]);expect(m.rpc.mock.calls[1][1]).toEqual({p_entity:entity,p_operation:c.operationId,p_data:data});
});
