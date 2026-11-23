package net.algt.mobiledms;

import java.net.URI;
import java.security.SecureRandom;
import java.util.Base64;

final class DmsRules {
    static final String LINK="https://erp.algt.net/api/mobile/dms/shared#";
    static final long MAX_ID=9007199254740991L;
    static boolean positive(long n){return n>0 && n<=MAX_ID;}
    static boolean hash(String value){return value!=null && value.matches("[0-9a-f]{64}");}
    static boolean revision(String value){try{return value.matches("[1-9][0-9]{0,18}") && Long.parseLong(value)>0;}catch(RuntimeException e){return false;}}
    static String token(){byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);}
    static boolean tokenValid(String s){return s!=null && s.matches("[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]");}
    static String parseLink(String raw){
        if(raw==null||raw.length()>180)return null;
        try{
            URI u=new URI(raw);String t;
            if(u.getRawQuery()!=null||u.getRawUserInfo()!=null)return null;
            if("https".equals(u.getScheme()) && ("erp.algt.net".equals(u.getRawAuthority())||"erp.algt.net:443".equals(u.getRawAuthority())) && "/api/mobile/dms/shared".equals(u.getRawPath()))t=u.getRawFragment();
            else if("algt-erp".equals(u.getScheme()) && "dms".equals(u.getRawAuthority()) && u.getRawFragment()==null && u.getRawPath().startsWith("/share/"))t=u.getRawPath().substring(7);
            else return null;
            return tokenValid(t)?t:null;
        }catch(Exception e){return null;}
    }
    static String qr(String raw){
        if(raw==null||raw.length()>512)return null;
        String s=raw.trim();
        if(s.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,127}"))return s;
        if(!s.matches("ALGT:DMS:1:[1-9][0-9]{0,15}"))return null;
        return positive(Long.parseLong(s.substring(11)))?s:null;
    }
    static boolean admitted(String owner,long epoch,long generation,String current,long nowEpoch,long nowGeneration,boolean unlocked,long now,long expires){
        return owner!=null && !owner.isEmpty() && owner.equals(current) && epoch>=0 && epoch==nowEpoch && generation>=0 && generation==nowGeneration && unlocked && now>=0 && now<expires;
    }
}
