/**
 * Voice-Enabled AI-Human Collaboration API - Ultra-optimized for injection
 * Minimal footprint, maximum performance, beautiful code that gets injected everywhere
 */

export function generateVoiceCollaborationAPI(): string {
  return `
(function(){
'use strict';
try{
const w=window,d=document,c=console,n=navigator;
const SR=w.SpeechRecognition||w.webkitSpeechRecognition;
const ss=w.speechSynthesis;
let vs,cr,speaking=0,listening=0;

// Namespace protection - prevent conflicts
if(w.mcpVoiceLoaded)return;
w.mcpVoiceLoaded=1;

// Initialize voice capabilities with comprehensive error handling
const init=async()=>{
  if(vs)return vs;
  try{
    const canSpeak=!!(ss&&ss.speak);
    const canListen=!!(SR&&n.mediaDevices);
    let micOK=0;
    
    if(canListen){
      try{
        const s=await Promise.race([
          n.mediaDevices.getUserMedia({audio:1}),
          new Promise((_,reject)=>setTimeout(()=>reject('timeout'),3000))
        ]);
        s.getTracks().forEach(t=>t.stop());
        micOK=1;
      }catch(e){}
    }
    
    vs={canSpeak,canListen:canListen&&micOK};
    if(canSpeak&&ss.getVoices().length>0)speak('Voice collaboration active');
    return vs;
  }catch(e){
    c.warn('[MCP] Voice init failed:',e);
    vs={canSpeak:0,canListen:0};
    return vs;
  }
};

// Ultra-compact speech synthesis with error protection
const speak=(text,opts={})=>{
  try{
    if(!vs?.canSpeak||speaking||!text||typeof text!=='string')return 0;
    const u=new SpeechSynthesisUtterance(text.slice(0,300)); // Prevent long text issues
    Object.assign(u,{rate:1,pitch:1,volume:1,...opts});
    const voices=ss.getVoices();
    u.voice=voices.find(v=>v.name.includes('Google')||v.name.includes('Microsoft'))||voices[0];
    u.onstart=()=>speaking=1;
    u.onend=u.onerror=()=>speaking=0;
    ss.speak(u);
    return 1;
  }catch(e){c.warn('[MCP] Speak failed:',e);return 0}
};

// Ultra-compact speech recognition with robust error handling
const listen=(timeout=10000)=>new Promise((resolve,reject)=>{
  try{
    if(!vs?.canListen||listening)return reject('Voice unavailable');
    timeout=Math.min(Math.max(timeout||5000,1000),30000); // Clamp timeout
    const r=new SR();
    Object.assign(r,{continuous:0,interimResults:0,lang:'en-US'});
    
    let resolved=0;
    const cleanup=()=>{listening=0;cr=null};
    
    r.onstart=()=>{listening=1;cr=r};
    r.onresult=e=>{
      if(resolved++)return;
      cleanup();
      const transcript=(e.results?.[0]?.[0]?.transcript||'').trim();
      resolve(transcript||'');
    };
    r.onerror=r.onend=()=>{
      if(resolved++)return;
      cleanup();
      reject('Recognition failed');
    };
    
    r.start();
    setTimeout(()=>{if(listening&&!resolved++){r.stop();cleanup();reject('Timeout')}},timeout);
  }catch(e){
    listening=0;cr=null;
    reject('Listen error: '+e.message);
  }
});

// Enhanced API with comprehensive safety
w.mcpNotify={
  info:(msg,opts={})=>{try{c.log(\`[MCP] \${msg||''}\`);if(opts?.speak!==0)speak(msg,opts?.voice)}catch(e){}},
  success:(msg,opts={})=>{try{c.log(\`[MCP] \${msg||''}\`);if(opts?.speak!==0)speak(\`Success! \${msg}\`,{...opts?.voice,pitch:1.2})}catch(e){}},
  warning:(msg,opts={})=>{try{c.warn(\`[MCP] \${msg||''}\`);if(opts?.speak!==0)speak(\`Warning: \${msg}\`,{...opts?.voice,pitch:0.8})}catch(e){}},
  error:(msg,opts={})=>{try{c.error(\`[MCP] \${msg||''}\`);if(opts?.speak!==0)speak(\`Error: \${msg}\`,{...opts?.voice,pitch:0.7})}catch(e){}},
  speak:(text,opts={})=>speak(text,opts)
};

w.mcpPrompt=async(question,opts={})=>{
  try{
    if(!question||typeof question!=='string')return '';
    question=question.slice(0,200); // Prevent long prompts
    opts=opts||{};
    
    if(vs?.canSpeak&&opts.speak!==0)speak(question,opts.voice);
    if(opts.useVoice!==0&&vs?.canListen){
      try{
        const result=await listen(opts.timeout||10000);
        if(vs.canSpeak)speak(\`I heard: \${result}\`,{rate:1.1});
        return result;
      }catch(e){
        if(opts.fallback!==0&&w.prompt)return w.prompt(question);
        return '';
      }
    }
    return w.prompt?w.prompt(question):'';
  }catch(e){c.warn('[MCP] Prompt failed:',e);return ''}
};

w.mcpInspector={
  active:0,
  start(instruction,callback,opts={}){
    try{
      if(this.active||!instruction||typeof instruction!=='string')return;
      instruction=instruction.slice(0,100); // Prevent long instructions
      this.active=1;
      
      if(vs?.canSpeak)speak(\`\${instruction}. Click target element.\`,opts?.voice);
      
      const indicator=d.createElement('div');
      indicator.id='mcp-indicator';
      indicator.innerHTML=\`<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,123,255,0.9);color:white;padding:12px 20px;border-radius:25px;font:14px -apple-system,sans-serif;z-index:999999;backdrop-filter:blur(10px);pointer-events:none;user-select:none">🎯 \${instruction}</div>\`;
      
      // Safe DOM append with timing handling
      const tryAppend=()=>{
        if(d.body){
          d.body.appendChild(indicator);
          return 1;
        }else if(d.documentElement){
          d.documentElement.appendChild(indicator);
          return 1;
        }
        return 0;
      };
      
      if(!tryAppend()){
        if(d.readyState==='loading'){
          d.addEventListener('DOMContentLoaded',()=>tryAppend());
        }else{
          setTimeout(()=>tryAppend(),10);
        }
      }
      
      const onClick=e=>{
        try{
          e.preventDefault();e.stopPropagation();
          this.active=0;
          d.removeEventListener('click',onClick,1);
          indicator.remove();
          if(vs?.canSpeak)speak('Got it!');
          if(callback&&typeof callback==='function')callback(e.target);
        }catch(err){c.warn('[MCP] Inspector click failed:',err)}
      };
      
      d.addEventListener('click',onClick,1);
      setTimeout(()=>{if(this.active)this.stop()},Math.min(opts?.timeout||30000,60000));
    }catch(e){c.warn('[MCP] Inspector failed:',e);this.active=0}
  },
  stop(){
    try{
      this.active=0;
      const el=d.getElementById('mcp-indicator');
      if(el)el.remove();
    }catch(e){}
  }
};

// Auto-initialize with final error boundary
init().catch(e=>c.warn('[MCP] Voice init failed:',e));
c.log('[MCP] Voice collaboration loaded safely');

}catch(globalError){
// Ultimate safety net - never let this script break the page
console.warn('[MCP] Voice API failed to load:',globalError);
window.mcpNotify={info:()=>{},success:()=>{},warning:()=>{},error:()=>{},speak:()=>{}};
window.mcpPrompt=()=>Promise.resolve('');
window.mcpInspector={active:0,start:()=>{},stop:()=>{}};
}
})();
`;
}