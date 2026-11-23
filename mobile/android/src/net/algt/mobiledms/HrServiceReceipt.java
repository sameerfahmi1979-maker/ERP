package net.algt.mobiledms;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;
import org.json.JSONObject;

/** Matches the original strict service DTO to its immutable verified transition. */
final class HrServiceReceipt {
    private HrServiceReceipt() {}

    static boolean matches(JSONObject original,JSONObject receipt,JSONObject pinned){
        if(original==null || receipt==null || receipt.length()!=7 || !(receipt.opt("replayed") instanceof Boolean))return false;
        String op=text(original,"op"),uuid=text(original,"operationId"),effect=text(receipt,"effect");
        long employee=id(original,"employeeId"),target=id(original,"id");
        if(!HrRules.uuid(uuid) || !uuid.equals(text(receipt,"operationId")) || employee<=0 || id(receipt,"employeeId")!=employee
            || id(receipt,"id")<=0 || (target>0 && id(receipt,"id")!=target) || !HrV5Rules.receiptEffect(op,text(original,"decision"),effect))return false;
        if(!receipt.has("canonical") || pinned!=null && !sameReceipt(pinned,receipt))return false;
        String revision=text(receipt,"revision");
        switch(op){
            case "serviceSubmit": case "issueAcknowledge":
                return "1".equals(revision) && receipt.isNull("canonical");
            case "serviceDecision":
                return target>0 && revision.equals(advance(text(original,"revision"),1)) && HrRules.validRevision(revision) && receipt.isNull("canonical");
            case "serviceFulfil":
                return target>0 && "2".equals(text(original,"revision")) && "3".equals(revision)
                    && canonical(original.optJSONObject("command"),receipt.optJSONObject("canonical"),uuid);
            default:return false;
        }
    }

    private static boolean canonical(JSONObject command,JSONObject c,String operation){
        if(command==null || c==null || c.length()!=5 || id(c,"id")<=0 || !c.has("revision") || !c.has("operationId") || !c.has("issuanceId"))return false;
        String action=text(command,"kind"),kind=text(c,"kind"),revision=text(c,"revision"),proof=text(c,"operationId");
        long record=id(c,"id");
        JSONObject source=command.optJSONObject("source");
        if(action.equals("issue-letter")||action.equals("link-issued-letter")||action.equals("recover-letter")){
            return "issued-document".equals(kind) && c.isNull("revision") && c.isNull("operationId") && id(c,"issuanceId")==record
                && (action.equals("issue-letter") || record==id(command,"issuanceId"));
        }
        if(!c.isNull("issuanceId") || !HrRules.validRevision(revision) || !HrRules.uuid(proof))return false;
        switch(action){
            case "record-replacement":{
                JSONObject selected=command.optJSONObject("newSource");
                return ("ppe".equals(kind)||"asset".equals(kind)) && kind.equals(text(source,"kind")) && record!=id(source,"id")
                    && sourceMatches(selected,kind,record,revision,0) && proof.equals(text(command,"canonicalOperationId"));
            }
            case "save-dependent":
                return "dependent".equals(kind) && proof.equals(text(command,"canonicalOperationId"))
                    && (source==null ? "1".equals(revision) : sourceMatches(source,kind,record,revision,1));
            case "resolve-accommodation":
                return ("accommodation".equals(kind)||"hr-action".equals(kind)) && sameCanonical(command.optJSONObject("canonical"),c);
            case "record-return":
                if(!"asset".equals(kind) && !"ppe".equals(kind))return false;
                break;
            case "complete-task":if(!"onboarding-task".equals(kind))return false;break;
            case "record-clearance":if(!"clearance".equals(kind))return false;break;
            case "record-pro-follow-up":if(!"pro-process".equals(kind))return false;break;
            case "change-shift":if(!"shift-assignment".equals(kind))return false;break;
            case "create-overtime":if(!"overtime".equals(kind))return false;break;
            default:return false;
        }
        int steps=action.equals("complete-task")||action.equals("record-clearance")?2:1;
        if(!proof.equals(stepOperation(operation,steps)))return false;
        if(action.equals("create-overtime") || action.equals("change-shift") && source==null)return "1".equals(revision);
        return sourceMatches(source,kind,record,revision,steps);
    }

    private static boolean sourceMatches(JSONObject s,String kind,long id,String revision,int steps){
        return s!=null && id(s,"id")==id && kind.equals(text(s,"kind")) && revision.equals(advance(text(s,"revision"),steps));
    }

    private static String stepOperation(String original,int steps){
        UUID namespace=UUID.fromString(original);
        byte[] bytes=ByteBuffer.allocate(16).putLong(namespace.getMostSignificantBits()).putLong(namespace.getLeastSignificantBits()).array();
        try{
            MessageDigest sha=MessageDigest.getInstance("SHA-1"); // RFC 4122 UUIDv5, matching the canonical SQL sub-operation.
            sha.update(bytes);
            byte[] name=sha.digest(("canonical-"+steps).getBytes(StandardCharsets.US_ASCII));
            name[6]=(byte)((name[6]&15)|0x50);name[8]=(byte)((name[8]&63)|0x80);
            ByteBuffer result=ByteBuffer.wrap(name);
            return new UUID(result.getLong(),result.getLong()).toString();
        }catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    private static String advance(String value,int steps){
        return HrRules.validRevision(value)?new BigInteger(value).add(BigInteger.valueOf(steps)).toString():"";
    }
    private static boolean sameReceipt(JSONObject a,JSONObject b){
        if(id(a,"id")!=id(b,"id") || id(a,"employeeId")!=id(b,"employeeId") || !text(a,"operationId").equals(text(b,"operationId"))
            || !text(a,"effect").equals(text(b,"effect")) || !text(a,"revision").equals(text(b,"revision")))return false;
        return a.isNull("canonical")?b.isNull("canonical"):sameCanonical(a.optJSONObject("canonical"),b.optJSONObject("canonical"));
    }
    private static boolean sameCanonical(JSONObject a,JSONObject b){
        return a!=null && b!=null && id(a,"id")==id(b,"id") && id(a,"issuanceId")==id(b,"issuanceId") && a.isNull("issuanceId")==b.isNull("issuanceId")
            && text(a,"kind").equals(text(b,"kind")) && a.isNull("revision")==b.isNull("revision") && text(a,"revision").equals(text(b,"revision"))
            && a.isNull("operationId")==b.isNull("operationId") && text(a,"operationId").equals(text(b,"operationId"));
    }
    private static long id(JSONObject value,String key){
        Object raw=value==null?null:value.opt(key);
        if(!(raw instanceof Integer) && !(raw instanceof Long))return -1;
        long id=((Number)raw).longValue();
        return id>0 && id<=9007199254740991L?id:-1;
    }
    private static String text(JSONObject value,String key){return value!=null && value.opt(key) instanceof String?(String)value.opt(key): "";}
}
