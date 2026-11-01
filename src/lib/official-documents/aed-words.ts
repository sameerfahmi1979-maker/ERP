/** Deterministic decimal conversion. No floating rounding, AI or remote call.
 * Bounded to the supported monetary range; unsupported values are held. */
const enSmall=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const enTens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const arSmall=['صفر','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
const arTens=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
const arHundreds=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];
function en(n:number):string{
 if(n<20)return enSmall[n];if(n<100)return enTens[Math.floor(n/10)]+(n%10?'-'+en(n%10):'');
 if(n<1000)return en(Math.floor(n/100))+' hundred'+(n%100?' and '+en(n%100):'');
 const scale=n>=1000000?1000000:1000;return en(Math.floor(n/scale))+(scale===1000?' thousand':' million')+(n%scale?(n%scale<100?' and ':' ')+en(n%scale):'');
}
function ar(n:number):string{
 if(n<20)return arSmall[n];if(n<100)return(n%10?ar(n%10)+' و':'')+arTens[Math.floor(n/10)];
 if(n<1000)return arHundreds[Math.floor(n/100)]+(n%100?' و'+ar(n%100):'');
 const scale=n>=1000000?1000000:1000,q=Math.floor(n/scale),r=n%scale;
 const label=scale===1000?['ألف','ألفان','آلاف','ألفاً']:['مليون','مليونان','ملايين','مليوناً'];
 return(q===1?label[0]:q===2?label[1]:ar(q)+' '+(q<=10?label[2]:label[3]))+(r?' و'+ar(r):'');
}
export function aedAmountWords(value:unknown):{en:string;ar:string}{
 const text=String(value??'');if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(text))throw Error('A positive AED amount with at most two decimal places is required.');
 const [whole,fraction='']=text.split('.'),units=Number(whole),fils=Number(fraction.padEnd(2,'0'));
 if(units===0&&fils===0)throw Error('Salary must be positive.');
 const arabicCurrency=(n:number,singular:string,dual:string,plural:string)=>n===1?singular:n===2?dual:ar(n)+' '+(n>=3&&n<=10?plural:singular);
 return {en:en(units)+' UAE dirham'+(units===1?'':'s')+(fils?' and '+en(fils)+' fil'+(fils===1?'':'s'):'')+' only',
 ar:arabicCurrency(units,'درهم إماراتي','درهمان إماراتيان','دراهم إماراتية')+(fils?' و'+arabicCurrency(fils,'فلس','فلسان','فلوس'):'')+' فقط'};
}
