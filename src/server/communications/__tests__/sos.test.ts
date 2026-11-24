import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchSos } from '../sos';
import { reserveCommunicationBudget } from '../budget';
import { userRpc } from '../http';

vi.mock('server-only', () => ({}));
vi.mock('../budget', () => ({reserveCommunicationBudget:vi.fn()}));
vi.mock('../http', () => ({
  userRpc:vi.fn(),
  CommunicationHttpError:class extends Error {
    constructor(readonly code:string,message?:string) {super(message ?? code);}
  },
}));
const epoch='eb39d539-96b7-4df8-9788-7ec219205922';
const channelId='9807fd05-13e3-45ba-ab0d-5ed1430bc07d';
const incidentId='2d23ec9f-63b7-41e6-b0f8-90a0b83108a9';
const args={epoch,channelId,incidentId};
const actor={profileId:'2',authUserId:channelId,authSessionId:epoch,isGlobalSystemAdmin:false};
const held={ok:false as const,status:503 as const,reason:'internal_sensitive_detail'};

describe('authenticated SOS HTTP dispatcher',()=>{
  beforeEach(()=>{vi.resetAllMocks();});
  it('binds retained origin to the exact session, incident and unmodified payload',async()=>{
    const command={op:'sos.send',args};
    vi.mocked(reserveCommunicationBudget).mockResolvedValue({ok:true,permitId:epoch,newReservation:true,expiresAt:new Date(Date.now()+10000)});
    vi.mocked(userRpc).mockResolvedValue({incidentId,state:'recorded'});
    expect(await dispatchSos(command,actor)).toEqual({incidentId,state:'recorded'});
    expect(reserveCommunicationBudget).toHaveBeenCalledWith(expect.objectContaining({
      feature:'sos',operationId:'sos:2:'+incidentId,liabilityEndsAt:null,binding:{actorSessionId:epoch,command},
    }));
    expect(userRpc).toHaveBeenCalledWith('erp_sos_v1',{p_request:{...command,_budgetPermitId:epoch}});
  });
  it('only reconciles a prior duplicate when the budget declined', async()=>{
    vi.mocked(reserveCommunicationBudget).mockResolvedValue(held);
    const command={op:'sos.send',args};
    vi.mocked(userRpc).mockResolvedValue({incidentId,state:'cancelled'});
    await expect(dispatchSos(command,actor)).resolves.toEqual({incidentId,state:'cancelled'});
    expect(userRpc).toHaveBeenCalledExactlyOnceWith('erp_sos_v1',{p_request:{...command,_lookupOnly:true}});
    vi.mocked(userRpc).mockResolvedValue({incidentId,state:'unknown'});
    await expect(dispatchSos(command,actor)).rejects.toMatchObject({message:'SOS is currently unavailable.'});
  });
  it('allows bounded cancellation and sender status during a pause; history remains metered',async()=>{
    for(const op of ['sos.cancel','sos.status']) await dispatchSos({op,args},actor);
    expect(reserveCommunicationBudget).not.toHaveBeenCalled();
    vi.mocked(reserveCommunicationBudget).mockResolvedValue(held);
    await expect(dispatchSos({op:'sos.history',args:{channelId,mode:'participant'}},actor)).rejects.toMatchObject({code:'temporarily_unavailable'});
    expect(userRpc).toHaveBeenCalledTimes(2);
  });
  it('rejects client budget overrides, response tracking and cancellation location',async()=>{
    for(const [op,extra] of [['sos.send',{_budgetPermitId:epoch}],['sos.send',{responders:[]}],['sos.cancel',{location:{}}]] as const)
      await expect(dispatchSos({op,args:{...args,...extra}},actor)).rejects.toMatchObject({code:'invalid_request'});
    expect(userRpc).not.toHaveBeenCalled();
    expect(reserveCommunicationBudget).not.toHaveBeenCalled();
  });
});
