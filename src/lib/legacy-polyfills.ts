/*
 * Polyfills mínimos para navegadores de Smart TV (Chromium 69–92: Tizen, webOS, Android TV antigas).
 * Vão inline no <head>, antes do runtime do Next, porque alguns (globalThis, queueMicrotask) são usados
 * já no carregamento dos chunks. Em navegador moderno cada linha só testa e não faz nada.
 */
export const LEGACY_POLYFILLS = `(function(){
var g=typeof globalThis!=="undefined"?globalThis:typeof self!=="undefined"?self:window;
if(typeof globalThis==="undefined"){g.globalThis=g;}
function def(o,k,v){if(!(k in o))Object.defineProperty(o,k,{value:v,writable:true,configurable:true});}
def(g,"queueMicrotask",function(cb){Promise.resolve().then(cb).catch(function(e){setTimeout(function(){throw e;});});});
def(Object,"fromEntries",function(it){var o={};Array.from(it,function(e){o[e[0]]=e[1];});return o;});
def(Object,"hasOwn",function(o,k){return Object.prototype.hasOwnProperty.call(o,k);});
function at(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return n<0||n>=this.length?undefined:this[n];}
def(Array.prototype,"at",at);def(String.prototype,"at",at);
def(String.prototype,"replaceAll",function(s,r){if(s instanceof RegExp)return this.replace(s,r);return this.split(s).join(typeof r==="function"?r(s):r);});
def(String.prototype,"trimStart",String.prototype.trimLeft);def(String.prototype,"trimEnd",String.prototype.trimRight);
def(Array.prototype,"flat",function(d){d=d===undefined?1:Math.trunc(d);return d<1?Array.prototype.slice.call(this):Array.prototype.reduce.call(this,function(a,v){return a.concat(Array.isArray(v)?v.flat(d-1):v);},[]);});
def(Array.prototype,"flatMap",function(f,t){return Array.prototype.map.call(this,f,t).flat();});
def(Array.prototype,"findLast",function(f,t){for(var i=this.length-1;i>=0;i--)if(f.call(t,this[i],i,this))return this[i];});
def(Array.prototype,"findLastIndex",function(f,t){for(var i=this.length-1;i>=0;i--)if(f.call(t,this[i],i,this))return i;return -1;});
def(Promise,"allSettled",function(ps){return Promise.all(Array.from(ps,function(p){return Promise.resolve(p).then(function(v){return{status:"fulfilled",value:v};},function(e){return{status:"rejected",reason:e};});}));});
def(Promise,"withResolvers",function(){var r={};r.promise=new Promise(function(a,b){r.resolve=a;r.reject=b;});return r;});
if(typeof g.AggregateError==="undefined"){g.AggregateError=function(errors,msg){var e=new Error(msg);e.name="AggregateError";e.errors=Array.from(errors||[]);return e;};}
def(Promise,"any",function(ps){return new Promise(function(res,rej){var a=Array.from(ps),n=a.length,errs=[];if(!n)return rej(new g.AggregateError([],"All promises were rejected"));a.forEach(function(p,i){Promise.resolve(p).then(res,function(e){errs[i]=e;if(--n===0)rej(new g.AggregateError(errs,"All promises were rejected"));});});});});
// flex gap (Chromium < 84): sem ele os itens ficam colados; o CSS gera margens quando <html> tem .no-flexgap
try{var d=document.createElement("div"),h=document.documentElement;d.style.cssText="display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden";d.appendChild(document.createElement("div"));d.appendChild(document.createElement("div"));h.appendChild(d);if(d.scrollHeight!==1)h.classList.add("no-flexgap");h.removeChild(d);}catch(e){}
})();`;
