(function () {
  "use strict";

  var KEYS_MAJOR_SHARPS = ["C","G","D","A","E","B","F#","C#"];
  var KEYS_MAJOR_FLATS  = ["C","F","Bb","Eb","Ab","Db","Gb","Cb"];
  var KEYS_MINOR_SHARPS = ["Am","Em","Bm","F#m","C#m","G#m","D#m","A#m"];
  var KEYS_MINOR_FLATS  = ["Am","Dm","Gm","Cm","Fm","Bbm","Ebm","Abm"];
  var KEY_PC = { C:0,"B#":0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,Fb:4,F:5,"E#":5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11,H:11,Cb:11 };
  var KEY_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  var KEY_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","Cb"];

  function prefersSharps(accType, accCount){ return !(accType==="flats" && accCount>0); }
  function keyFromSignature(accType, accCount, mode){
    var n=clamp(accCount,0,7), isMajor=mode==="major";
    return accType==="sharps" ? (isMajor?KEYS_MAJOR_SHARPS[n]:KEYS_MINOR_SHARPS[n]) : (isMajor?KEYS_MAJOR_FLATS[n]:KEYS_MINOR_FLATS[n]);
  }
  function keyToPc(keyName){ var root=keyName&&keyName.endsWith("m")?keyName.slice(0,-1):keyName; return KEY_PC.hasOwnProperty(root)?KEY_PC[root]:0; }
  function pcToKeyName(pc,isMinor,preferSharps){ var names=preferSharps?KEY_NAMES_SHARP:KEY_NAMES_FLAT, root=names[((pc%12)+12)%12]; return isMinor?root+"m":root; }
  function germanizeKeyName(keyName){ var isMinor=keyName&&keyName.endsWith("m"), root=isMinor?keyName.slice(0,-1):keyName, mapped=root==="B"?"H":(root==="Bb"?"B":root); return isMinor?mapped+"m":mapped; }
  function describeKeyName(keyName){ var display=germanizeKeyName(keyName), isMinor=display&&display.endsWith("m"), root=isMinor?display.slice(0,-1):display; return root+(isMinor?"-Moll":"-Dur"); }
  function transposeSemis(instr){ if(instr==="Bb") return 2; if(instr==="A") return 3; if(instr==="Eb") return -3; return 0; }
  function durToAbc(d){ if(d===1)return""; if(d===2)return"2"; if(d===4)return"4"; if(d===8)return"8"; if(d===0.5)return"/"; return""; }
  function pcToAbcName(pc,useSharps){ var s=["C","^C","D","^D","E","F","^F","G","^G","A","^A","B"], f=["C","_D","D","_E","E","F","_G","G","_A","A","_B","B"]; return (useSharps?s:f)[pc%12]; }
  function midiToAbc(m,useSharps){ var pc=((m%12)+12)%12, oct=Math.floor(m/12)-1, name=pcToAbcName(pc,useSharps), acc="", letter=name; if(name[0]==="^"||name[0]==="_"){acc=name[0];letter=name.slice(1);} var out=oct>=5?letter.toLowerCase():letter.toUpperCase(), marks=""; if(oct>5) marks=repeat("'",oct-5); else if(oct<4) marks=repeat(",",4-oct); return acc+out+marks; }
  function repeat(ch,n){ var s=""; for(var i=0;i<n;i++) s+=ch; return s; }
  function clamp(v,min,max){ var x=parseInt(v,10); if(isNaN(x)) x=min; if(x<min)x=min; if(x>max)x=max; return x; }

  var state={
    accType:"sharps", accCount:0, mode:"major", meter:"4/4", instrument:"Bb",
    title:"", autoBars:true, tokensPerLine:16, pitchShift:0,
    slurStartNext:false, slurEndNext:false, tokens:[], octave:4, dur:1
  };

  var $=function(id){return document.getElementById(id);};
  var accTypeSharps=$("accTypeSharps"), accTypeFlats=$("accTypeFlats"), accCount=$("accCount"), modeMajor=$("modeMajor"), modeMinor=$("modeMinor"), meter=$("meter"), instrument=$("instrument"), tokensPerLine=$("tokensPerLine"), pitchShift=$("pitchShift");
  var pitchButtons=$("pitchButtons"), pitchButtonsSticky=$("pitchButtonsSticky"), octDown=$("octDown"), octUp=$("octUp"), octLabel=$("octLabel");
  var addRest=$("addRest"), addBar=$("addBar"), addNewline=$("addNewline"), slurStartBtn=$("slurStart"), slurEndBtn=$("slurEnd"), undo=$("undo"), clearBtn=$("clear");
  var paper=$("paper"), renderStatus=$("renderStatus"), noteNamesEl=$("noteNames"), origKeyText=$("origKeyText"), targetKeyLabel=$("targetKeyLabel"), printBtn=$("print"), savePdfBtn=$("savePdf"), titleInput=$("titleInput");
  var shiftDownBtn=$("shiftDown"), shiftUpBtn=$("shiftUp"), shiftLabel=$("shiftLabel");
  var themeToggle=$("themeToggle"), dockToggle=$("dockToggle");
  var actionsTab=$("actionsTab"), actionsPanel=$("actionsPanel");
  var accidental=0, staffOctDown, staffOctUp;

  function makeButton(label, onClick, className){ var b=document.createElement("button"); b.type="button"; b.className=className||"btn"; b.textContent=label; b.addEventListener("click",onClick); return b; }

  function buildPitchUI(target){
    if (!target) return;
    target.innerHTML="";
    var staffWrap=document.createElement("div"); staffWrap.className="staff";
    var staffControls=document.createElement("div"); staffControls.className="staff-controls";
    staffOctDown=makeButton("−", function(){ adjustOctave(-1); },"btn sm");
    staffOctUp  =makeButton("+", function(){ adjustOctave(1); },"btn sm");
    staffControls.appendChild(staffOctDown); staffControls.appendChild(staffOctUp); staffWrap.appendChild(staffControls);
    target.appendChild(staffWrap);
    buildStaffGrid(staffWrap);
    setAccToggles();
  }

  function setAccToggles(){
    var wrap=(pitchButtonsSticky && pitchButtonsSticky.firstChild) || (pitchButtons && pitchButtons.firstChild);
    if(!wrap) return;
    var btns=wrap.querySelectorAll("button");
    for(var i=0;i<btns.length;i++) btns[i].classList.remove("active");
    var idx=accidental===-1?0:(accidental===0?1:2); if(btns[idx]) btns[idx].classList.add("active");
  }

  function buildStaffGrid(root){
    root.innerHTML="";
    var naturalPcs=[0,2,4,5,7,9,11], minMidi=55, maxMidi=83, baseMidiPositions=[];
    for(var m=minMidi;m<=maxMidi;m++){ var pc=((m%12)+12)%12; if(naturalPcs.indexOf(pc)!==-1) baseMidiPositions.push(m); }
    var slots=baseMidiPositions.length, refMidi=71, refIndex=baseMidiPositions.indexOf(refMidi); if(refIndex===-1) refIndex=Math.floor(slots/2);
    var baseMargin=24, noteStep=16, height=baseMargin*2+noteStep*(slots-1), lineCount=5, lineGap=noteStep*2, minIdxY=refIndex-slots+5, startY=baseMargin+(-minIdxY)*noteStep;
    var noteSpacing=80, paddingX=60, width=paddingX*2+(slots-1)*noteSpacing, xPositions=[]; for(var xi=0;xi<slots;xi++) xPositions.push(paddingX+xi*noteSpacing);
    var svgNS="http://www.w3.org/2000/svg", svg=document.createElementNS(svgNS,"svg"); svg.setAttribute("viewBox","0 0 "+width+" "+height); svg.setAttribute("class","staff-svg");
    for(var i=0;i<lineCount;i++){ var y=startY+i*lineGap; var line=document.createElementNS(svgNS,"line"); line.setAttribute("x1",12); line.setAttribute("x2",width-12); line.setAttribute("y1",y); line.setAttribute("y2",y); line.setAttribute("class","staff-line"); svg.appendChild(line); }
    var bandHeight=noteStep, octaveShift=(state.octave-4)*12, useSharps=prefersSharps(state.accType,state.accCount);
    function displayNoteName(midi){ var pc=((midi%12)+12)%12, oct=Math.floor(midi/12)-1, sharp=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","H"], flat=["C","D♭","D","E♭","E","F","G♭","G","A♭","A","B","H"]; return (useSharps?sharp:flat)[pc]+oct; }
    function attachClick(el, base){ el.addEventListener("click", function(){ addStaffNote(base); }); }
    for(var j=0;j<slots;j++){
      var idxY=(refIndex-j)+4, centerY=startY+idxY*bandHeight;
      var rect=document.createElementNS(svgNS,"rect"); rect.setAttribute("x",0); rect.setAttribute("width",width); rect.setAttribute("y",centerY-bandHeight/2); rect.setAttribute("height",bandHeight); rect.setAttribute("class","staff-zone"); rect.dataset.baseMidi=baseMidiPositions[j]; svg.appendChild(rect);
      var r=Math.min(20,bandHeight*1.05); var head=document.createElementNS(svgNS,"circle"); head.setAttribute("cx",xPositions[j]); head.setAttribute("cy",centerY); head.setAttribute("r",r); head.setAttribute("class","notehead"); head.dataset.baseMidi=baseMidiPositions[j]; svg.appendChild(head);
      var label=document.createElementNS(svgNS,"text"); label.setAttribute("x",xPositions[j]); label.setAttribute("y",centerY+(r-2)); label.setAttribute("class","note-label"); label.textContent=displayNoteName(baseMidiPositions[j]+octaveShift); svg.appendChild(label);
      var top=startY, bottom=startY+(lineCount-1)*lineGap, ledgerSpacing=lineGap;
      function ledger(yPos){ var l=document.createElementNS(svgNS,"line"); l.setAttribute("x1",xPositions[j]-30); l.setAttribute("x2",xPositions[j]+30); l.setAttribute("y1",yPos); l.setAttribute("y2",yPos); l.setAttribute("class","ledger-line"); svg.appendChild(l); }
      if(centerY<top-bandHeight){ for(var ly=top-ledgerSpacing; ly>=centerY-bandHeight; ly-=ledgerSpacing) ledger(ly); }
      else if(centerY>bottom+bandHeight){ for(var ly2=bottom+ledgerSpacing; ly2<=centerY+bandHeight; ly2+=ledgerSpacing) ledger(ly2); }
      attachClick(head, baseMidiPositions[j]); attachClick(rect, baseMidiPositions[j]);
    }
    root.appendChild(svg);
  }

  function addStaffNote(baseMidi){
    var midi=baseMidi+(accidental||0);
    state.tokens.push({kind:"note", midi:midi, dur:state.dur, slurStart:state.slurStartNext, slurEnd:state.slurEndNext});
    accidental=0; state.slurStartNext=false; state.slurEndNext=false;
    updateSlurButtons(); setAccToggles(); sync();
  }
  function addRestToken(){ state.tokens.push({kind:"rest", dur:state.dur}); sync(); }
  function addBarToken(){ state.tokens.push({kind:"bar"}); sync(); }
  function addNewlineToken(){ state.tokens.push({kind:"newline"}); sync(); }
  function undoToken(){ state.tokens.pop(); sync(); }
  function clearTokens(){ state.tokens=[]; sync(); }

  function setOctaveLabel(){ octLabel.textContent="C"+state.octave; var staff=document.querySelector(".staff"); if(staff) buildStaffGrid(staff); }
  function meterToEighths(meter){ if(!meter||typeof meter!=="string") return 8; var p=meter.split("/"); if(p.length!==2) return 8; var num=parseInt(p[0],10), den=parseInt(p[1],10); if(!num||!den) return 8; return num*(8/den); }

  function computeKeyInfo(){
    var key=keyFromSignature(state.accType,state.accCount,state.mode), prefer=prefersSharps(state.accType,state.accCount), trans=transposeSemis(state.instrument), basePc=keyToPc(key), isMinor=state.mode==="minor", writtenPc=((basePc+trans)%12+12)%12;
    return { baseKeyName:pcToKeyName(basePc,isMinor,prefer), writtenKeyName:pcToKeyName(writtenPc,isMinor,prefer), preferSharps:prefer, transSemis:trans };
  }

  function buildAbc(keyInfo){
    var info=keyInfo||computeKeyInfo(), useSharps=info.preferSharps, trans=info.transSemis, title=state.title||"", measureLen=meterToEighths(state.meter);
    var abc=["X:1","T:"+title,"M:"+state.meter,"L:1/8","K:"+info.writtenKeyName], body=[], names=[], accCount=0;
    for(var i=0;i<state.tokens.length;i++){
      var t=state.tokens[i];
      if(t.kind==="bar"){ body.push("|"); names.push("|"); accCount=0; continue; }
      if(t.kind==="newline"){ body.push("\n"); names.push("\n"); accCount=0; continue; }
      if(t.kind==="rest"){ var r="z"+durToAbc(t.dur); body.push(r); names.push(r); accCount+=t.dur; }
      else if(t.kind==="note"){ var out=t.midi+trans, note=midiToAbc(out,useSharps), dur=durToAbc(t.dur), pre=t.slurStart?"(":"", suf=t.slurEnd?")":""; body.push(pre+note+dur+suf); names.push(pre+note+suf); accCount+=t.dur; }
      if(state.autoBars && measureLen>0){ while(accCount>=measureLen){ body.push("|"); names.push("|"); accCount-=measureLen; } }
    }
    var wrapped=[], line=[]; for(var j=0;j<body.length;j++){ var tok=body[j]; if(tok==="\n"){ wrapped.push(line.join(" ")); line=[]; continue; } line.push(tok); if(state.tokensPerLine>0 && line.length>=state.tokensPerLine){ wrapped.push(line.join(" ")); line=[]; } }
    if(line.length) wrapped.push(line.join(" "));
    abc.push(wrapped.join("\n")); return { abc:abc.join("\n"), names:names.join(" ") };
  }

  function renderAbc(abc){
    if(!window.ABCJS||!window.ABCJS.renderAbc){ renderStatus.textContent="abcjs noch nicht geladen (CDN)."; return; }
    paper.innerHTML=""; renderStatus.textContent="";
    try{ window.ABCJS.renderAbc(paper, abc, { responsive:"resize", add_classes:true }); }
    catch(e){ renderStatus.textContent="Render-Fehler: "+(e&&e.message?e.message:String(e)); }
  }

  function sync(){
    var info=computeKeyInfo(), original=describeKeyName(info.baseKeyName);
    origKeyText.textContent=original; targetKeyLabel.textContent=describeKeyName(info.writtenKeyName);
    setOctaveLabel();
    var res=buildAbc(info);
    noteNamesEl.textContent=res.names;
    renderAbc(res.abc);
  }

  function setSegActive(on,off){ on.classList.add("active"); off.classList.remove("active"); }

  accTypeSharps.addEventListener("click", function(){ state.accType="sharps"; setSegActive(accTypeSharps,accTypeFlats); sync(); });
  accTypeFlats.addEventListener("click", function(){ state.accType="flats"; setSegActive(accTypeFlats,accTypeSharps); sync(); });
  accCount.addEventListener("change", function(){ state.accCount=clamp(accCount.value,0,7); sync(); });
  modeMajor.addEventListener("click", function(){ state.mode="major"; setSegActive(modeMajor,modeMinor); sync(); });
  modeMinor.addEventListener("click", function(){ state.mode="minor"; setSegActive(modeMinor,modeMajor); sync(); });
  meter.addEventListener("change", function(){ state.meter=meter.value||"4/4"; sync(); });
  instrument.addEventListener("change", function(){ state.instrument=instrument.value||"Bb"; sync(); });
  if(tokensPerLine){ tokensPerLine.addEventListener("change", function(){ var v=parseInt(tokensPerLine.value,10); if(isNaN(v)) v=state.tokensPerLine; v=Math.max(0,Math.min(64,v)); state.tokensPerLine=v; tokensPerLine.value=v; sync(); }); tokensPerLine.value=state.tokensPerLine; }
  if(pitchShift){ pitchShift.addEventListener("change", function(){ var v=parseInt(pitchShift.value,10); if(isNaN(v)) v=state.pitchShift; v=Math.max(-12,Math.min(12,v)); state.pitchShift=v; pitchShift.value=v; shiftLabel.textContent=v; sync(); }); pitchShift.value=state.pitchShift; }
  if(shiftDownBtn&&shiftUpBtn&&shiftLabel){ function applyShift(d){ var n=Math.max(-12,Math.min(12,state.pitchShift+d)); state.pitchShift=n; pitchShift.value=n; shiftLabel.textContent=n; sync(); } shiftDownBtn.addEventListener("click", function(){ applyShift(-1); }); shiftUpBtn.addEventListener("click", function(){ applyShift(1); }); shiftLabel.textContent=state.pitchShift; }

  function setDurActive(btn){ var all=document.querySelectorAll(".btn.dur"); for(var i=0;i<all.length;i++) all[i].classList.remove("active"); btn.classList.add("active"); }
  function handleDurTarget(t){ if(!t||!t.classList||!t.classList.contains("dur")) return; var v=t.getAttribute("data-dur"); state.dur=(v==="1/2")?0.5:parseInt(v,10); setDurActive(t); }
  var durTouchSeen=false;
  document.addEventListener("touchstart", function(e){ var t=e.target; if(t&&t.classList&&t.classList.contains("dur")){ durTouchSeen=true; e.preventDefault(); handleDurTarget(t); sync(); } }, {passive:false});
  document.addEventListener("click", function(e){ var t=e.target; if(durTouchSeen){ durTouchSeen=false; if(t&&t.classList&&t.classList.contains("dur")) return; } handleDurTarget(t); sync(); });

  function adjustOctave(d){ state.octave=Math.min(8,Math.max(1,state.octave+d)); sync(); }
  octDown.addEventListener("click", function(){ adjustOctave(-1); });
  octUp.addEventListener("click", function(){ adjustOctave(1); });

  bindTouchClick(addRest, addRestToken);
  bindTouchClick(addBar, addBarToken);
  bindTouchClick(addNewline, addNewlineToken);
  function updateSlurButtons(){ slurStartBtn.classList.toggle("active", state.slurStartNext); slurEndBtn.classList.toggle("active", state.slurEndNext); }
  updateSlurButtons();
  bindTouchClick(slurStartBtn, function(){ state.slurStartNext=!state.slurStartNext; updateSlurButtons(); });
  bindTouchClick(slurEndBtn, function(){ state.slurEndNext=!state.slurEndNext; updateSlurButtons(); });
  bindTouchClick(undo, undoToken);
  bindTouchClick(clearBtn, clearTokens);
  if(titleInput){ titleInput.addEventListener("input", function(){ state.title=titleInput.value||""; sync(); }); }
  if(autoBars){ autoBars.addEventListener("change", function(){ state.autoBars=!!autoBars.checked; sync(); }); state.autoBars=!!autoBars.checked; }

  function applyTheme(theme){
    var mode=(theme==="dark")?"dark":"light";
    document.body.classList.toggle("dark", mode==="dark");
    if(themeToggle){
      var icon = mode==="dark" ? "☀️" : "🌙";
      var label = mode==="dark" ? "Auf hell schalten" : "Auf dunkel schalten";
      themeToggle.textContent=icon;
      themeToggle.setAttribute("aria-label", label);
    }
    try{ localStorage.setItem("claritrans-theme", mode); }catch(e){}
  }
  if(themeToggle){ themeToggle.addEventListener("click", function(){ var next=document.body.classList.contains("dark")?"light":"dark"; applyTheme(next); }); }
  (function initTheme(){ var saved="light"; try{ saved=localStorage.getItem("claritrans-theme")||"light"; }catch(e){} applyTheme(saved); })();

  function setDockOpen(open){
    var body=document.body;
    var next = (typeof open==="boolean") ? open : !body.classList.contains("dock-open");
    body.classList.toggle("dock-open", next);
    if(dockToggle){
      dockToggle.textContent = next ? "Einstellungen ←" : "Einstellungen →";
      dockToggle.setAttribute("aria-label", next ? "Einstellungen ausblenden" : "Einstellungen einblenden");
    }
  }
  if(dockToggle){ dockToggle.addEventListener("click", function(e){ e.stopPropagation(); setDockOpen(); }); }

  function setActionsOpen(open){
    if(!actionsPanel) return;
    var wrap=actionsPanel.parentElement;
    if(!wrap) return;
    var next = (typeof open==="boolean") ? open : !wrap.classList.contains("open");
    wrap.classList.toggle("open", next);
    if(actionsTab){
      actionsTab.setAttribute("aria-expanded", next);
      actionsTab.textContent = next ? "Aktionen ▼" : "Aktionen ▲";
    }
  }
  if(actionsTab){ actionsTab.addEventListener("click", function(e){ e.stopPropagation(); setActionsOpen(); }); }
  document.addEventListener("click", function(e){
    var wrap=actionsPanel && actionsPanel.parentElement;
    if(!wrap || !wrap.classList.contains("open")) return;
    if(wrap.contains(e.target)) return;
    setActionsOpen(false);
  });

  function bindTouchClick(el, handler){ if(!el) return; var touchSeen=false; el.addEventListener("touchstart", function(e){ touchSeen=true; e.preventDefault(); handler(e); }, {passive:false}); el.addEventListener("click", function(e){ if(touchSeen){ touchSeen=false; return; } handler(e); }); }

  function getSvgDims(svg){ var w=parseFloat(svg.getAttribute("width"))||0, h=parseFloat(svg.getAttribute("height"))||0, vb=svg.getAttribute("viewBox"); if((!w||!h)&&vb){ var p=vb.split(/\s+/).map(parseFloat); if(p.length===4){w=p[2]; h=p[3];}} if((!w||!h)&&svg.getBBox){ try{ var bb=svg.getBBox(); w=w||bb.width; h=h||bb.height; }catch(e){} } return {w:w||800,h:h||400}; }
  function svgToPng(svg,w,h){ return new Promise(function(resolve,reject){ var ser=new XMLSerializer(), svgStr=ser.serializeToString(svg), blob=new Blob([svgStr],{type:"image/svg+xml;charset=utf-8"}), url=URL.createObjectURL(blob), img=new Image(); img.onload=function(){ var c=document.createElement("canvas"); c.width=w; c.height=h; var ctx=c.getContext("2d"); ctx.drawImage(img,0,0,w,h); URL.revokeObjectURL(url); try{ resolve(c.toDataURL("image/png")); }catch(err){ reject(err); } }; img.onerror=function(e){ URL.revokeObjectURL(url); reject(e); }; img.src=url; }); }
  var svg2pdfLoader;
  function getSvg2pdfFn(){ if(typeof window.svg2pdf==="function") return window.svg2pdf; if(window.svg2pdf&&typeof window.svg2pdf.default==="function") return window.svg2pdf.default; if(window.svg2pdf&&typeof window.svg2pdf.svg2pdf==="function") return window.svg2pdf.svg2pdf; if(typeof window.svg2pdfjs==="function") return window.svg2pdfjs; if(window.svg2pdfjs&&typeof window.svg2pdfjs.default==="function") return window.svg2pdfjs.default; if(window.svg2pdfjs&&typeof window.svg2pdfjs.svg2pdf==="function") return window.svg2pdfjs.svg2pdf; return null; }
  function ensureSvg2pdf(){ var fn=getSvg2pdfFn(); if(fn) return Promise.resolve(fn); if(svg2pdfLoader) return svg2pdfLoader; svg2pdfLoader=new Promise(function(resolve,reject){ var s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.4/dist/svg2pdf.umd.min.js"; s.onload=function(){ var f=getSvg2pdfFn(); if(f) resolve(f); else reject(new Error("svg2pdf not found")); }; s.onerror=function(){ reject(new Error("svg2pdf load failed")); }; document.head.appendChild(s); }); return svg2pdfLoader; }

  async function downloadPdf(){
    if(!window.jspdf){ if(renderStatus) renderStatus.textContent="PDF-Export: jsPDF nicht geladen."; return; }
    var svg=paper && paper.querySelector("svg"); if(!svg){ if(renderStatus) renderStatus.textContent="PDF-Export: Kein Notenblatt gefunden."; return; }
    var fn=null; try{ fn=await ensureSvg2pdf(); }catch(e){ fn=null; }
    var dims=getSvgDims(svg), doc=new (window.jspdf.jsPDF)({unit:"pt",format:"a4"}), pageW=doc.internal.pageSize.getWidth(), pageH=doc.internal.pageSize.getHeight(), margin=24, scale=Math.min((pageW-margin*2)/dims.w,(pageH-margin*2)/dims.h), x=margin,y=margin;
    try{
      if(fn){ var clone=svg.cloneNode(true), res=fn(clone, doc,{x:x,y:y,width:dims.w*scale,height:dims.h*scale}); if(res&&typeof res.then==="function") await res; }
      else { var dataUrl=await svgToPng(svg,dims.w,dims.h); doc.addImage(dataUrl,"PNG",x,y,dims.w*scale,dims.h*scale); }
      doc.save("claritrans.pdf"); if(renderStatus) renderStatus.textContent="PDF gespeichert.";
    }catch(err){ if(renderStatus) renderStatus.textContent="PDF-Export fehlgeschlagen."; console.error(err); }
  }

  (function installPrintTitleHack(){ var original=document.title; function clearTitle(){ document.title=" "; } function restore(){ document.title=original; } window.addEventListener("beforeprint", clearTitle); window.addEventListener("afterprint", restore); })();

  buildPitchUI(pitchButtonsSticky || pitchButtons);
  setDockOpen(false);
  sync();
})();
