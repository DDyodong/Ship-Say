import React from "react";
import { Check, ChevronDown } from "lucide-react";

function Feature({icon:Icon,title,text}) { return <article><Icon/><div><b>{title}</b><span>{text}</span></div></article>; }

function SectionHead({eyebrow,title,desc,action}) { return <div className="section-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{desc}</p></div>{action}</div>; }
function Stat({icon:Icon,label,value,sub,tone="blue"}) { return <article className={`stat ${tone}`}><div><Icon/></div><span><small>{label}</small><b>{value}</b><em>{sub}</em></span></article>; }
function Panel({title,action,children}) { return <article className="panel"><div className="panel-head"><h3>{title}</h3><span>{action}</span></div>{children}</article>; }
function Task({done,text,time,onClick}) { return <button className={`task ${done?"done":""}`} onClick={onClick}><span>{done?<Check/>:""}</span><div><b>{text}</b><small>{time}</small></div><ChevronDown/></button>; }
export { Feature, SectionHead, Stat, Panel, Task };
