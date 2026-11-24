package net.algt.mobiledms;

import java.util.*;
import java.io.*;
import java.util.zip.*;

public final class DmsRulesTest {
    static void check(boolean result) { if(!result) throw new AssertionError(); }
    public static void main(String[] args) throws Exception {
        String token=DmsRules.token();
        String link=DmsRules.LINK+token;
        check(token.length()==43 && token.equals(DmsRules.parseLink(link)));
        check(token.equals(DmsRules.parseLink("algt-erp://dms/share/"+token)));
        for(String bad:new String[]{link.replace("https","http"),link.replace(".net",".net.evil"),link.replace("erp.","user@erp."),link.replace("#","?#"),link+"=",link.replace("shared","%73hared"),DmsRules.LINK+token.substring(0,42)+"B"}) check(DmsRules.parseLink(bad)==null);
        for(String bad:new String[]{"ALGT:DMS:1:01","ALGT:DMS:1:9007199254740992","ALGT:DMS:2:42","https://erp.algt.net","%31","a/b"})check(DmsRules.qr(bad)==null);
        check("Ab-1".equals(DmsRules.qr(" Ab-1 ")) && "ALGT:DMS:1:9007199254740991".equals(DmsRules.qr("ALGT:DMS:1:9007199254740991")));
        check(DmsRules.revision("9223372036854775807") && !DmsRules.revision("9223372036854775808") && !DmsRules.revision("01"));
        check(DmsRules.admitted("a",2,3,"a",2,3,true,99,100));
        check(!DmsRules.admitted("a",2,3,"b",2,3,true,99,100) && !DmsRules.admitted("a",2,3,"a",2,4,true,99,100) && !DmsRules.admitted("a",2,3,"a",2,3,true,100,100));
        Set<String> names=new HashSet<>(); String one=DmsArchive.name("../Case.pdf",names),two=DmsArchive.name("case.pdf",names);
        check(!one.contains("/") && !one.equalsIgnoreCase(two));
        File dir=java.nio.file.Files.createTempDirectory("pack-test").toFile(), f=new File(dir,"input");
        java.nio.file.Files.write(f.toPath(),new byte[]{1,2,3});
        File z=new File(dir,"pack.zip");check(z.createNewFile());
        DmsArchive.Member member=new DmsArchive.Member(f,"a.txt",3,"039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
        DmsArchive.zip(Arrays.asList(member),z,()->true);
        try(ZipFile zip=new ZipFile(z)){check(zip.size()==1 && zip.getEntry("a.txt").getSize()==3);}
        java.nio.file.Files.write(f.toPath(),new byte[]{1,3,2});
        try{DmsArchive.zip(Arrays.asList(member),z,()->true);throw new AssertionError();}catch(IOException expected){}
        check(!z.exists());
        System.out.println("DmsRulesTest OK");
    }
}
