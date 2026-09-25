import { expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderInvitationEmail } from '@/lib/auth/invitation-email';
const input={displayName:'Test Employee',appName:'ALGT ERP',siteUrl:'https://erp.algt.net',logoPath:'/api/branding/public/app_logo?v=1',actionLink:'https://erp.algt.net/auth/verify?invitation='+'a'.repeat(43),expiresAt:'2026-09-26T08:00:00Z',supportEmail:'support@example.invalid'};
it('contains ALGT logo, HTML activation button, absolute ERP-only links and truthful expiry',()=>{
 const mail=renderInvitationEmail(input);const doc=new JSDOM(mail.htmlBody).window.document;
 expect(doc.querySelector('img')?.getAttribute('alt')).toBe('ALGT logo');
 expect(doc.querySelector('img')?.getAttribute('src')).toBe('https://erp.algt.net/api/branding/public/app_logo?v=1');
 expect(doc.querySelector('a')?.textContent).toContain('Set up your password');
 expect(mail.htmlBody).toContain('26 September 2026');expect(mail.htmlBody).toContain('12:00 (Dubai time)');
 expect(mail.htmlBody).toContain('24 hours');expect(mail.htmlBody).not.toContain('supabase.co');
 expect(doc.querySelectorAll('script,iframe,form')).toHaveLength(0);expect(mail.textBody).toContain(input.actionLink);
 expect(mail.htmlBody).toContain('max-width:600px');
});
it('escapes user/branding data and never renders an unsafe support URL',()=>{
 const mail=renderInvitationEmail({...input,displayName:'<script>alert(1)</script>',appName:'ALGT\r\nBcc:bad',supportEmail:'" onmouseover="bad'});
 expect(mail.htmlBody).toContain('&lt;script&gt;');expect(mail.subject).not.toMatch(/[\r\n]/);expect(mail.htmlBody).not.toContain('mailto:');
});
it.each(['https://evil.invalid/auth/verify?invitation='+'a'.repeat(43),'javascript:alert(1)','https://erp.algt.net/auth/verify?invitation=short',input.actionLink+'&next=https://evil.invalid'])('rejects noncanonical activation URL %s',actionLink=>expect(()=>renderInvitationEmail({...input,actionLink})).toThrow());
it('rejects third-party logo tracking and invalid expiry',()=>{
 expect(()=>renderInvitationEmail({...input,logoPath:'https://evil.invalid/pixel'})).toThrow();
 expect(()=>renderInvitationEmail({...input,expiresAt:'invalid'})).toThrow();
});
