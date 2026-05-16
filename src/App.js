import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const HM = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
const HD = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']
const AUD_TAGS = ['ילדים','נוער','צעירים','משפחות','מבוגרים','גיל שלישי','כולם']
const TYPE_TAGS = ['חינם','בהרשמה','אונליין','חוץ','פנים','חד פעמי','רב פעמי','אירוע חודשי','אירוע שנתי']
const ADMIN_PASSWORD = 'admin2024!'
const COLOR_OPTS = ['#D9B26A','#9DB89C','#D89A86','#C9A2A6','#7E9AA6','#B89377','#A8C5B5','#C4A882','#B5A8C4','#8BC4C4']

let HOLIDAYS = {}

function hexLight(h){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return`rgb(${Math.min(255,r+70)},${Math.min(255,g+70)},${Math.min(255,b+70)})`}
function hexDark(h){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return`rgb(${Math.max(0,r-60)},${Math.max(0,g-60)},${Math.max(0,b-60)})`}
function fmtDate(d){const[,m,day]=d.split('-');return`${parseInt(day)} ב${HM[parseInt(m)-1]}`}
function dsStr(y,m,d){return`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}

function expandRecurring(events) {
  const result = []
  for (const ev of events) {
    if (!ev.is_recurring || !ev.recurrence_end_date) { result.push(ev); continue }
    const start = new Date(ev.date)
    const end = new Date(ev.recurrence_end_date)
    const cur = new Date(start)
    if (ev.recurrence_type === 'weekly' && ev.recurrence_day_of_week != null) {
      while (cur.getDay() !== ev.recurrence_day_of_week) cur.setDate(cur.getDate() + 1)
      while (cur <= end) {
        result.push({...ev, date: dsStr(cur.getFullYear(), cur.getMonth(), cur.getDate()), _virtual: true})
        cur.setDate(cur.getDate() + 7)
      }
    } else if (ev.recurrence_type === 'monthly' && ev.recurrence_day_of_month != null) {
      cur.setDate(1)
      while (cur <= end) {
        const daysInMonth = new Date(cur.getFullYear(), cur.getMonth()+1, 0).getDate()
        const actualDay = Math.min(ev.recurrence_day_of_month, daysInMonth)
        const occ = new Date(cur.getFullYear(), cur.getMonth(), actualDay)
        if (occ >= start && occ <= end) {
          result.push({...ev, date: dsStr(occ.getFullYear(), occ.getMonth(), occ.getDate()), _virtual: true})
        }
        cur.setMonth(cur.getMonth() + 1)
      }
    } else { result.push(ev) }
  }
  return result
}

function exportToExcel(registrations, eventTitle) {
  const headers = ['שם מלא','טלפון','מספר נפשות','מספר תקציב','תאריך הרשמה']
  const rows = registrations.map(r => [r.full_name, r.phone, r.people_count||1, r.budget_number||'', new Date(r.created_at).toLocaleDateString('he-IL')])
  const bom = '\uFEFF'
  const csv = bom + [headers,...rows].map(row=>row.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href=url; a.download=`נרשמים_${eventTitle}_${new Date().toLocaleDateString('he-IL').replace(/\//g,'-')}.csv`
  a.click(); URL.revokeObjectURL(url)
}

const S = `
@import url('https://fonts.googleapis.com/css2?family=Secular+One&family=Assistant:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#FDFAF5;--surface:#fff;--text:#3a3028;--muted:#8a7a6a;--border:rgba(180,160,130,0.22);--hol-l:#FBF3DC;--hol:#C8A84B;--hol-e:#EDE0B8;--H:'Secular One',sans-serif;--B:'Assistant',sans-serif;}
body{font-family:var(--B);direction:rtl;background:var(--bg);color:var(--text);font-size:14px}
.nav{display:flex;align-items:center;justify-content:space-between;padding:11px 20px;background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:50}
.logo{font-family:var(--H);font-size:17px;color:var(--text)}.logo span{color:#4a6e49}
.nav-links{display:flex;gap:4px}
.nb{padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;border:none;background:transparent;color:var(--muted);transition:all .15s;font-family:var(--H)}
.nb:hover{background:var(--bg)}.nb.active{background:var(--text);color:#fff}
.hero{background:#3a3028;padding:32px 20px;text-align:center}
.hero h1{font-family:var(--H);font-size:24px;color:#fff;margin-bottom:6px}
.hero p{font-size:13px;color:rgba(255,255,255,0.65);margin-bottom:18px}
.hsearch{display:flex;align-items:center;gap:10px;background:#fff;border-radius:30px;padding:9px 18px;max-width:400px;margin:0 auto}
.hsearch input{flex:1;border:none;outline:none;font-family:var(--B);font-size:13px;direction:rtl;background:transparent;color:var(--text)}
.sec{padding:18px 20px 0}
.sec-title{font-family:var(--H);font-size:15px;margin-bottom:12px}
.cat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:18px}
.cat-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:12px 8px;text-align:center;cursor:pointer;transition:transform .15s}
.cat-card:hover{transform:translateY(-2px)}
.cat-icon{font-size:22px;margin-bottom:5px}
.cat-name{font-family:var(--H);font-size:11px;margin-bottom:2px}
.erow{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none}
.erow::-webkit-scrollbar{display:none}
.ecard{flex-shrink:0;width:190px;background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;cursor:pointer;transition:transform .15s}
.ecard:hover{transform:translateY(-2px)}
.eimg{height:88px;display:flex;align-items:center;justify-content:center;font-size:32px;position:relative;overflow:hidden;background:#F5F0E8}
.eimg img{width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0}
.ebadge{position:absolute;top:5px;right:5px;padding:2px 7px;border-radius:12px;font-size:9px;font-family:var(--H);z-index:1}
.ebody{padding:9px}
.etitle{font-family:var(--H);font-size:12px;margin-bottom:5px;line-height:1.3}
.emeta{font-size:11px;color:var(--muted);display:flex;align-items:center;gap:4px;margin-bottom:2px}
.sbar{background:#F0EBE2;border-radius:4px;height:4px;margin:5px 0 3px}
.sfill{height:100%;border-radius:4px}
.calwrap{padding:14px 18px}
.fbar{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:12px 14px;margin-bottom:14px}
.ftop{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}
.ftitle{font-family:var(--H);font-size:13px}
.flbl{font-family:var(--H);font-size:10px;color:var(--muted);letter-spacing:.04em;margin-bottom:5px;margin-top:8px}
.cbgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:2px}
.cbgrid3{display:grid;grid-template-columns:repeat(3,1fr);gap:2px}
.cbi{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:9px;cursor:pointer;font-size:12px}
.cbi:hover{background:var(--bg)}
.cbi input{accent-color:var(--text);width:13px;height:13px;cursor:pointer;flex-shrink:0}
.cdot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.cnav{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.cnbtn{background:none;border:1px solid var(--border);border-radius:8px;padding:4px 9px;cursor:pointer;font-size:15px;color:var(--muted)}
.clbl{font-family:var(--H);font-size:16px}
.vtabs{display:flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-right:auto}
.vt{padding:5px 13px;font-size:12px;cursor:pointer;background:transparent;border:none;color:var(--muted);transition:all .15s;font-family:var(--H)}
.vt.active{background:var(--text);color:white}
.cgrid{background:var(--surface);border-radius:14px;border:1px solid var(--border);overflow:hidden}
.cdh{display:grid;grid-template-columns:repeat(7,1fr);background:#F5F0E8}
.cdl{text-align:center;padding:8px 0;font-size:11px;font-family:var(--H);color:var(--muted)}
.cbody{display:grid;grid-template-columns:repeat(7,1fr)}
.ccell{min-height:84px;border-top:1px solid var(--border);border-right:1px solid var(--border);overflow:hidden}
.ccell:nth-child(7n){border-right:none}
.ctop{display:flex;align-items:center;justify-content:space-between;padding:3px 4px 1px;gap:2px}
.cdate{font-family:var(--H);font-size:11px;color:var(--muted);min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0}
.cdate.today{background:var(--text);color:#fff}
.cdate.other{color:#ddd}
.holi{font-family:var(--H);font-size:8px;padding:1px 4px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:68px;flex-shrink:1}
.holi.chag{background:var(--hol-l);color:#7a5c10;border:1px solid var(--hol)}
.holi.erev{background:var(--hol-e);color:#7a5000;border:1px dashed var(--hol)}
.cevs{padding:0 3px 3px}
.cev{border-radius:4px;padding:1px 4px;font-size:9px;margin-bottom:2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.moreev{font-size:9px;color:var(--muted);padding:0 3px}
.inp{width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:10px;font-size:13px;font-family:var(--B);background:var(--bg);direction:rtl;outline:none;margin-bottom:10px}
.inp:focus{border-color:var(--muted)}
.btn{padding:10px 20px;border:none;border-radius:10px;font-size:14px;font-family:var(--H);cursor:pointer;color:#fff;background:var(--text)}
.btn:hover{opacity:.9}
.btn-sm{padding:6px 12px;border:none;border-radius:8px;font-size:11px;font-family:var(--H);cursor:pointer;color:#fff;white-space:nowrap}
.btn-out{padding:6px 14px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:var(--H);cursor:pointer;background:transparent;color:var(--text)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:14px}
.card-title{font-family:var(--H);font-size:13px;margin-bottom:12px}
.overlay{position:fixed;inset:0;background:rgba(58,48,40,0.45);display:flex;align-items:flex-start;justify-content:center;z-index:200;padding:20px;overflow-y:auto}
.modal{background:#fff;border-radius:18px;padding:22px;max-width:480px;width:100%;margin:auto}
.modal-lg{background:#fff;border-radius:18px;padding:22px;max-width:640px;width:100%;margin:auto}
.mbadge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-family:var(--H);margin-bottom:9px}
.mtitle{font-family:var(--H);font-size:18px;margin-bottom:7px}
.mrow{display:flex;align-items:flex-start;gap:7px;margin-bottom:6px;font-size:12px;color:var(--muted)}
.mdesc{font-size:12px;line-height:1.6;padding:9px;background:var(--bg);border-radius:10px;margin:9px 0}
.tag{font-size:10px;padding:2px 7px;border-radius:10px;margin-left:3px;margin-bottom:3px;display:inline-block}
.err{color:#c0392b;font-size:12px;margin-top:6px}
.suc{color:#4a6e49;font-size:12px;margin-top:6px}
.color-opt{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .12s;display:inline-block;margin-left:5px}
.color-opt.sel{border-color:var(--text);transform:scale(1.2)}
.week-grid{background:white;border-radius:14px;border:1px solid var(--border);overflow:hidden}
.day-col{border-right:1px solid var(--border);position:relative}
.day-col:last-child{border-right:none}
.time-slot{height:44px;border-top:1px solid var(--border)}
.week-ev{position:absolute;left:2px;right:2px;border-radius:6px;padding:2px 5px;font-size:9px;cursor:pointer;overflow:hidden}
.upload-box{border:2px dashed var(--border);border-radius:10px;padding:20px;text-align:center;cursor:pointer;margin-bottom:10px;transition:all .15s;display:block;width:100%}
.upload-box:hover{border-color:var(--muted);background:var(--bg)}
.upload-preview{width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:6px;display:block}
.reg-table{width:100%;border-collapse:collapse;font-size:12px}
.reg-table th{background:#F5F0E8;padding:8px 10px;text-align:right;font-family:var(--H);font-size:11px;border-bottom:2px solid var(--border)}
.reg-table td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:top}
.reg-table tr:last-child td{border-bottom:none}
.reg-table tr:hover td{background:var(--bg)}
.rec-box{background:#F0EAF8;border:1px solid #C9A2A6;border-radius:10px;padding:12px;margin-bottom:10px}
.day-btn{padding:5px 9px;border-radius:8px;cursor:pointer;font-size:11px;border:1.5px solid var(--border);background:transparent;color:var(--muted);font-family:var(--B);transition:all .12s}
.day-btn.sel{border-color:var(--text);background:var(--text);color:white}
`

// ── ADD EVENT MODAL ─────────────────────────────────────────────────────────────
function AddEventModal({ deptIn, onClose, onSubmit, msg }) {
  const [ev, setEv] = useState({title:'',description:'',date:'',time:'',location:'',price:'חינם',spots:'',audience:'כולם',tags:[],zoom_link:'',is_recurring:false,recurrence_type:'weekly',recurrence_day_of_week:0,recurrence_day_of_month:1,recurrence_end_date:''})
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const isOnline = ev.tags.includes('אונליין')
  function toggleTag(t){setEv(p=>({...p,tags:p.tags.includes(t)?p.tags.filter(x=>x!==t):[...p.tags,t]}))}
  function handleImageChange(e){const file=e.target.files[0];if(!file)return;setImageFile(file);setImagePreview(URL.createObjectURL(file))}
  async function handleSubmit(){
    if(!ev.title||!ev.date||!ev.time||!ev.location){onSubmit(ev,null,'נא למלא כותרת, תאריך, שעה ומיקום');return}
    if(ev.is_recurring&&!ev.recurrence_end_date){onSubmit(ev,null,'נא לבחור תאריך סיום');return}
    let imageUrl=null
    if(imageFile){
      setUploading(true)
      const ext=imageFile.name.split('.').pop().toLowerCase()
      const fileName=`event_${Date.now()}.${ext}`
      const {error:upErr}=await supabase.storage.from('event-images').upload(fileName,imageFile,{cacheControl:'3600',upsert:false})
      setUploading(false)
      if(upErr){onSubmit(ev,null,'שגיאה בהעלאת תמונה: '+upErr.message);return}
      const {data:urlData}=supabase.storage.from('event-images').getPublicUrl(fileName)
      imageUrl=urlData.publicUrl
    }
    onSubmit(ev,imageUrl,null)
  }
  return(
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div style={{fontFamily:'var(--H)',fontSize:17}}>הוספת אירוע חדש</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--muted)'}}>✕</button>
        </div>
        <input className="inp" placeholder="כותרת האירוע *" value={ev.title} onChange={e=>setEv(p=>({...p,title:e.target.value}))}/>
        <textarea className="inp" placeholder="תיאור מלא של האירוע" rows={3} value={ev.description} onChange={e=>setEv(p=>({...p,description:e.target.value}))} style={{resize:'vertical'}}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <div><div style={{fontSize:11,color:'var(--muted)',marginBottom:4}}>{ev.is_recurring?'תאריך התחלה *':'תאריך *'}</div><input className="inp" type="date" style={{margin:0}} value={ev.date} onChange={e=>setEv(p=>({...p,date:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:'var(--muted)',marginBottom:4}}>שעה *</div><input className="inp" type="time" style={{margin:0}} value={ev.time} onChange={e=>setEv(p=>({...p,time:e.target.value}))}/></div>
        </div>
        <input className="inp" placeholder="מיקום *" value={ev.location} onChange={e=>setEv(p=>({...p,location:e.target.value}))}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <input className="inp" placeholder="מחיר (חינם / ₪30)" style={{margin:0}} value={ev.price} onChange={e=>setEv(p=>({...p,price:e.target.value}))}/>
          <input className="inp" placeholder="מקס׳ משתתפים" type="number" min="0" style={{margin:0}} value={ev.spots} onChange={e=>setEv(p=>({...p,spots:e.target.value}))}/>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:6}}>קהל יעד</div>
          <select className="inp" style={{margin:0}} value={ev.audience} onChange={e=>setEv(p=>({...p,audience:e.target.value}))}>
            {AUD_TAGS.map(a=><option key={a}>{a}</option>)}
          </select>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:6}}>תגיות</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {TYPE_TAGS.map(t=><button key={t} type="button" onClick={()=>toggleTag(t)} style={{padding:'4px 10px',borderRadius:20,cursor:'pointer',fontSize:12,fontFamily:'var(--B)',border:`1.5px solid ${ev.tags.includes(t)?'var(--text)':'var(--border)'}`,background:ev.tags.includes(t)?'var(--text)':'transparent',color:ev.tags.includes(t)?'white':'var(--muted)'}}>{t}</button>)}
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
            <input type="checkbox" checked={ev.is_recurring} onChange={e=>setEv(p=>({...p,is_recurring:e.target.checked}))} style={{width:15,height:15,accentColor:'var(--text)'}}/>
            <span style={{fontFamily:'var(--H)'}}>🔄 אירוע חוזר (שבועי / חודשי)</span>
          </label>
        </div>
        {ev.is_recurring&&(
          <div className="rec-box">
            <div style={{fontSize:12,fontFamily:'var(--H)',marginBottom:10,color:'#7a4a4e'}}>הגדרות חזרה</div>
            <div style={{display:'flex',gap:8,marginBottom:12}}>
              <button type="button" onClick={()=>setEv(p=>({...p,recurrence_type:'weekly'}))} style={{flex:1,padding:'8px',borderRadius:8,cursor:'pointer',fontFamily:'var(--H)',fontSize:12,border:`2px solid ${ev.recurrence_type==='weekly'?'#7a4a4e':'var(--border)'}`,background:ev.recurrence_type==='weekly'?'#F0E5E6':'transparent',color:ev.recurrence_type==='weekly'?'#7a4a4e':'var(--muted)'}}>כל שבוע</button>
              <button type="button" onClick={()=>setEv(p=>({...p,recurrence_type:'monthly'}))} style={{flex:1,padding:'8px',borderRadius:8,cursor:'pointer',fontFamily:'var(--H)',fontSize:12,border:`2px solid ${ev.recurrence_type==='monthly'?'#7a4a4e':'var(--border)'}`,background:ev.recurrence_type==='monthly'?'#F0E5E6':'transparent',color:ev.recurrence_type==='monthly'?'#7a4a4e':'var(--muted)'}}>כל חודש</button>
            </div>
            {ev.recurrence_type==='weekly'&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:6,fontFamily:'var(--B)'}}>איזה יום בשבוע?</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {HD.map((d,i)=><button key={i} type="button" onClick={()=>setEv(p=>({...p,recurrence_day_of_week:i}))} className={`day-btn${ev.recurrence_day_of_week===i?' sel':''}`}>{d}</button>)}
                </div>
              </div>
            )}
            {ev.recurrence_type==='monthly'&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:6,fontFamily:'var(--B)'}}>איזה יום בחודש? (1-31)</div>
                <input className="inp" type="number" min="1" max="31" style={{margin:0}} placeholder="למשל: 13" value={ev.recurrence_day_of_month} onChange={e=>setEv(p=>({...p,recurrence_day_of_month:parseInt(e.target.value)||1}))}/>
              </div>
            )}
            <div>
              <div style={{fontSize:11,color:'var(--muted)',marginBottom:4,fontFamily:'var(--B)'}}>תאריך סיום *</div>
              <input className="inp" type="date" style={{margin:0}} value={ev.recurrence_end_date} onChange={e=>setEv(p=>({...p,recurrence_end_date:e.target.value}))}/>
            </div>
          </div>
        )}
        {isOnline&&<input className="inp" placeholder="קישור זום / מיט" value={ev.zoom_link} onChange={e=>setEv(p=>({...p,zoom_link:e.target.value}))}/>}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:6}}>תמונה / פלייר (אופציונלי)</div>
          {imagePreview?(<><img src={imagePreview} alt="preview" className="upload-preview"/><button type="button" onClick={()=>{setImageFile(null);setImagePreview(null)}} style={{fontSize:11,color:'#c0392b',background:'none',border:'none',cursor:'pointer',marginBottom:8,fontFamily:'var(--B)'}}>הסר תמונה ✕</button></>):(
            <label className="upload-box">
              <div style={{fontSize:28,marginBottom:6}}>📷</div>
              <div style={{fontSize:13,color:'var(--text)',fontFamily:'var(--H)'}}>לחץ להעלאת תמונה</div>
              <div style={{fontSize:11,color:'var(--muted)',marginTop:3,fontFamily:'var(--B)'}}>JPG, PNG עד 5MB</div>
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{display:'none'}} onChange={handleImageChange}/>
            </label>
          )}
        </div>
        {msg&&<div className={msg.includes('שגיאה')?'err':'suc'} style={{marginBottom:8}}>{msg}</div>}
        <button type="button" className="btn" style={{width:'100%',background:deptIn?.dark_color||'var(--text)',opacity:uploading?0.7:1}} onClick={handleSubmit} disabled={uploading}>
          {uploading?'⏳ מעלה תמונה...':'📅 פרסם אירוע'}
        </button>
      </div>
    </div>
  )
}

// ── REG LIST MODAL ──────────────────────────────────────────────────────────────
function RegListModal({ ev, dept, onClose }) {
  const [regs, setRegs] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(()=>{
    supabase.from('registrations').select('*').eq('event_id',ev.id).order('created_at').then(({data})=>{setRegs(data||[]);setLoading(false)})
  },[ev.id])
  const totalPeople=regs.reduce((s,r)=>s+(r.people_count||1),0)
  return(
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-lg">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div><div style={{fontFamily:'var(--H)',fontSize:17}}>נרשמים לאירוע</div><div style={{fontSize:12,color:'var(--muted)',marginTop:3}}>{ev.title} | {fmtDate(ev.date)} | {ev.time}</div></div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--muted)'}}>✕</button>
        </div>
        <div style={{display:'flex',gap:12,marginBottom:16}}>
          <div style={{background:dept.light_color,color:dept.dark_color,padding:'8px 14px',borderRadius:10,textAlign:'center',flex:1}}><div style={{fontFamily:'var(--H)',fontSize:22}}>{regs.length}</div><div style={{fontSize:11}}>נרשמים</div></div>
          <div style={{background:'#E6F0E5',color:'#4a6e49',padding:'8px 14px',borderRadius:10,textAlign:'center',flex:1}}><div style={{fontFamily:'var(--H)',fontSize:22}}>{totalPeople}</div><div style={{fontSize:11}}>סה״כ נפשות</div></div>
          {ev.spots>0&&<div style={{background:'#FBF3DC',color:'#7a5c10',padding:'8px 14px',borderRadius:10,textAlign:'center',flex:1}}><div style={{fontFamily:'var(--H)',fontSize:22}}>{Math.max(0,ev.spots-regs.length)}</div><div style={{fontSize:11}}>מקומות פנויים</div></div>}
        </div>
        {regs.length>0&&<button type="button" onClick={()=>exportToExcel(regs,ev.title)} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',background:'#4a6e49',color:'white',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'var(--H)',fontSize:12,marginBottom:14}}>⬇️ הורד לאקסל</button>}
        {loading?<div style={{textAlign:'center',padding:30,color:'var(--muted)'}}>טוען...</div>:regs.length===0?<div style={{textAlign:'center',padding:30,color:'var(--muted)'}}>אין נרשמים עדיין</div>:(
          <div style={{overflowX:'auto'}}>
            <table className="reg-table">
              <thead><tr><th>#</th><th>שם מלא</th><th>טלפון</th><th>נפשות</th><th>מס׳ תקציב</th><th>תאריך הרשמה</th></tr></thead>
              <tbody>{regs.map((r,i)=>(<tr key={r.id}><td style={{color:'var(--muted)'}}>{i+1}</td><td style={{fontWeight:500}}>{r.full_name}</td><td><a href={`tel:${r.phone}`} style={{color:'var(--text)',textDecoration:'none'}}>{r.phone}</a></td><td style={{textAlign:'center'}}>{r.people_count||1}</td><td style={{color:'var(--muted)'}}>{r.budget_number||'—'}</td><td style={{color:'var(--muted)',fontSize:11}}>{new Date(r.created_at).toLocaleDateString('he-IL')}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── REG MODAL ───────────────────────────────────────────────────────────────────
function RegModal({ ev, dept, onClose, onSuccess }) {
  const [form, setForm] = useState({full_name:'',phone:'',people_count:'1',budget_number:''})
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  async function submit(){
    if(!form.full_name.trim()||!form.phone.trim()){setErr('נא למלא שם וטלפון');return}
    const {error}=await supabase.from('registrations').insert({event_id:ev.id,full_name:form.full_name.trim(),phone:form.phone.trim(),people_count:parseInt(form.people_count)||1,budget_number:form.budget_number.trim()})
    if(error){setErr('שגיאה: '+error.message);return}
    setDone(true);setTimeout(()=>onSuccess(),1500)
  }
  if(done)return(<div className="overlay" onClick={onClose}><div className="modal" style={{textAlign:'center',padding:40}}><div style={{fontSize:40,marginBottom:12}}>🎉</div><div style={{fontFamily:'var(--H)',fontSize:18,marginBottom:8}}>נרשמת בהצלחה!</div><div style={{color:'var(--muted)',fontSize:13}}>נתראה באירוע</div></div></div>)
  const full=ev.spots>0&&(ev.registered_count||0)>=ev.spots
  return(
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div style={{fontFamily:'var(--H)',fontSize:16}}>הרשמה לאירוע</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--muted)'}}>✕</button>
        </div>
        <div className="mbadge" style={{background:dept.light_color,color:dept.dark_color}}>{dept.name}</div>
        <div style={{fontFamily:'var(--H)',fontSize:16,marginBottom:12}}>{ev.title}</div>
        <div style={{fontSize:12,color:'var(--muted)',marginBottom:16}}>📅 {fmtDate(ev.date)} בשעה {ev.time} | 📍 {ev.location}</div>
        {full?<div style={{textAlign:'center',padding:20,background:'#FFF0F0',borderRadius:10,color:'#c0392b',fontFamily:'var(--H)'}}>האירוע מלא</div>:(
          <>
            <input className="inp" placeholder="שם מלא *" value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))}/>
            <input className="inp" placeholder="מספר טלפון *" type="tel" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/>
            <input className="inp" placeholder="מספר נפשות" type="number" min="1" value={form.people_count} onChange={e=>setForm(p=>({...p,people_count:e.target.value}))}/>
            <input className="inp" placeholder="מספר תקציב (אופציונלי)" value={form.budget_number} onChange={e=>setForm(p=>({...p,budget_number:e.target.value}))}/>
            {err&&<div className="err">{err}</div>}
            <button type="button" className="btn" style={{width:'100%',marginTop:8,background:dept.dark_color}} onClick={submit}>אישור הרשמה ✓</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── EVENT VIEW MODAL ─────────────────────────────────────────────────────────────
function EventViewModal({ ev, dept, onClose, onRegister }) {
  const pct=ev.spots>0?Math.round((ev.registered_count||0)/ev.spots*100):0
  const full=ev.spots>0&&(ev.registered_count||0)>=ev.spots
  const recLabel=ev.is_recurring?(ev.recurrence_type==='weekly'?`🔄 כל ${HD[ev.recurrence_day_of_week]}`:`🔄 כל ה-${ev.recurrence_day_of_month} לחודש`):null
  return(
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <button onClick={onClose} style={{float:'left',background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--muted)'}}>✕</button>
        {ev.image_url&&<img src={ev.image_url} alt={ev.title} style={{width:'100%',height:160,objectFit:'cover',borderRadius:12,marginBottom:14,display:'block'}}/>}
        <div style={{fontSize:28,marginBottom:7}}>{dept.emoji}</div>
        <div className="mbadge" style={{background:dept.light_color,color:dept.dark_color}}>{dept.name}</div>
        {recLabel&&<div style={{display:'inline-block',background:'#F0E5E6',color:'#7a4a4e',padding:'2px 10px',borderRadius:12,fontSize:11,fontFamily:'var(--H)',marginRight:6,marginBottom:9}}>{recLabel}</div>}
        <div className="mtitle">{ev.title}</div>
        {ev.tags&&ev.tags.length>0&&<div style={{marginBottom:9}}>{ev.tags.map(t=><span key={t} className="tag" style={{background:dept.light_color,color:dept.dark_color}}>{t}</span>)}</div>}
        <div className="mrow">📅 {fmtDate(ev.date)} בשעה {ev.time}</div>
        <div className="mrow">📍 {ev.location}</div>
        <div className="mrow">🎫 {ev.price||'חינם'}</div>
        <div className="mrow">👥 קהל יעד: {ev.audience||'כולם'}</div>
        {ev.spots>0&&(<><div className="mrow">🪑 {ev.registered_count||0} נרשמו מתוך {ev.spots}{full&&<strong style={{color:'#c0392b',marginRight:4}}> — מלא!</strong>}</div><div className="sbar"><div className="sfill" style={{width:`${pct}%`,background:dept.color}}/></div></>)}
        {ev.description&&<div className="mdesc">{ev.description}</div>}
        {ev.zoom_link&&<div className="mrow">🔗 <a href={ev.zoom_link} target="_blank" rel="noreferrer" style={{color:dept.dark_color}}>קישור לזום</a></div>}
        {!full&&<button type="button" className="btn" style={{width:'100%',marginTop:12,background:dept.dark_color}} onClick={onRegister}>הירשם לאירוע</button>}
      </div>
    </div>
  )
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState('home')
  const [depts, setDepts] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [holidaysLoaded, setHolidaysLoaded] = useState(false)
  const [activeDepts, setActiveDepts] = useState(new Set())
  const [activeAudTags, setActiveAudTags] = useState(new Set(AUD_TAGS))
  const [activeTypeTags, setActiveTypeTags] = useState(new Set(TYPE_TAGS))
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calView, setCalView] = useState('month')
  const [searchQ, setSearchQ] = useState('')
  const [viewEvent, setViewEvent] = useState(null)
  const [regEvent, setRegEvent] = useState(null)
  const [adminIn, setAdminIn] = useState(false)
  const [adminPwdInput, setAdminPwdInput] = useState('')
  const [adminErr, setAdminErr] = useState('')
  const [showAddDept, setShowAddDept] = useState(false)
  const [newDept, setNewDept] = useState({name:'',emoji:'📋',password:'',color:COLOR_OPTS[0]})
  const [deptMsg, setDeptMsg] = useState('')
  const [changePwdFor, setChangePwdFor] = useState(null)
  const [newPwdVal, setNewPwdVal] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [deptIn, setDeptIn] = useState(null)
  const [deptSelId, setDeptSelId] = useState('')
  const [deptPwdInput, setDeptPwdInput] = useState('')
  const [deptLoginErr, setDeptLoginErr] = useState('')
  const [showAddEv, setShowAddEv] = useState(false)
  const [evMsg, setEvMsg] = useState('')
  const [myEvents, setMyEvents] = useState([])
  const [viewRegsFor, setViewRegsFor] = useState(null)

  useEffect(()=>{ loadData(); loadHolidays() },[])

  async function loadHolidays(){
    try{
      const y=new Date().getFullYear()
      for(const year of [y-1,y,y+1,y+2]){
        const res=await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&nx=on&year=${year}&month=x&ss=on&mf=on&c=off&geo=none&M=on&s=off`)
        const data=await res.json()
        data.items?.forEach(item=>{
          const date=item.date?.slice(0,10);if(!date)return
          const isErev=item.category==='erev'||(item.title||'').toLowerCase().startsWith('erev')
          if(['holiday','erev','roshchodesh'].includes(item.category)){HOLIDAYS[date]={n:item.hebrew||item.title,t:isErev?'erev':'chag'}}
        })
      }
    }catch(e){console.log('Hebcal:',e)}
    setHolidaysLoaded(true)
  }

  async function loadData(){
    setLoading(true)
    const {data:d}=await supabase.from('departments').select('*').order('name')
    const {data:e}=await supabase.from('events').select('*').eq('is_approved',true).order('date')
    setDepts(d||[]); setEvents(e||[])
    setActiveDepts(new Set((d||[]).map(x=>x.id)))
    setLoading(false)
  }

  async function loadMyEvents(deptId){
    const {data}=await supabase.from('events').select('*').eq('department_id',deptId).order('date')
    setMyEvents(data||[])
  }

  function getDept(id){return depts.find(d=>d.id===id)}

  const allExpanded=expandRecurring(events)

  function filteredEvents(){
    return allExpanded.filter(e=>{
      if(!activeDepts.has(e.department_id))return false
      if(e.audience&&e.audience!=='כולם'&&!activeAudTags.has(e.audience)&&!activeAudTags.has('כולם'))return false
      if(e.tags&&e.tags.length>0&&activeTypeTags.size<TYPE_TAGS.length){if(!e.tags.some(t=>activeTypeTags.has(t)))return false}
      return true
    })
  }

  const handleAddEvent=useCallback(async(newEv,imageUrl,errMsg)=>{
    if(errMsg){setEvMsg(errMsg);return}
    const {error}=await supabase.from('events').insert({
      title:newEv.title,description:newEv.description,date:newEv.date,time:newEv.time,location:newEv.location,
      price:newEv.price,spots:parseInt(newEv.spots)||0,audience:newEv.audience,tags:newEv.tags,
      zoom_link:newEv.zoom_link||null,image_url:imageUrl||null,department_id:deptIn.id,is_approved:true,
      is_recurring:newEv.is_recurring,
      recurrence_type:newEv.is_recurring?newEv.recurrence_type:null,
      recurrence_day_of_week:newEv.is_recurring&&newEv.recurrence_type==='weekly'?newEv.recurrence_day_of_week:null,
      recurrence_day_of_month:newEv.is_recurring&&newEv.recurrence_type==='monthly'?newEv.recurrence_day_of_month:null,
      recurrence_end_date:newEv.is_recurring?newEv.recurrence_end_date:null
    })
    if(error){setEvMsg('שגיאה: '+error.message);return}
    setEvMsg('✓ האירוע פורסם! 🎉')
    loadMyEvents(deptIn.id); loadData()
    setTimeout(()=>{setShowAddEv(false);setEvMsg('')},1500)
  },[deptIn])

  async function deleteEvent(id){
    if(!window.confirm('למחוק אירוע זה?'))return
    await supabase.from('events').delete().eq('id',id)
    loadMyEvents(deptIn.id); loadData()
  }

  async function addDept(){
    if(!newDept.name||!newDept.password){setDeptMsg('נא למלא שם וסיסמה');return}
    if(newDept.password.length<4){setDeptMsg('סיסמה: לפחות 4 תווים');return}
    const {error}=await supabase.from('departments').insert({name:newDept.name,emoji:newDept.emoji,color:newDept.color,light_color:hexLight(newDept.color),dark_color:hexDark(newDept.color),password_hash:newDept.password})
    if(error){setDeptMsg('שגיאה: '+error.message);return}
    setDeptMsg('✓ המחלקה נוספה!')
    setNewDept({name:'',emoji:'📋',password:'',color:COLOR_OPTS[0]})
    loadData()
    setTimeout(()=>{setDeptMsg('');setShowAddDept(false)},2000)
  }

  async function changePassword(deptId){
    if(!newPwdVal||newPwdVal.length<4){setPwdMsg('לפחות 4 תווים');return}
    const {error}=await supabase.from('departments').update({password_hash:newPwdVal}).eq('id',deptId)
    if(error){setPwdMsg('שגיאה: '+error.message);return}
    setPwdMsg('✓ הסיסמה עודכנה!')
    await loadData()
    setTimeout(()=>{setChangePwdFor(null);setNewPwdVal('');setPwdMsg('')},1500)
  }

  async function deleteDept(id){
    if(!window.confirm('למחוק מחלקה זו?'))return
    await supabase.from('events').delete().eq('department_id',id)
    await supabase.from('departments').delete().eq('id',id)
    loadData()
  }

  function doAdminLogin(){
    if(adminPwdInput===ADMIN_PASSWORD){setAdminIn(true);setAdminErr('')}
    else setAdminErr('סיסמה שגויה')
  }

  // ── KEY FIX: fetch password LIVE from DB every login ──────────────────────
  async function doDeptLogin(){
    if(!deptSelId){setDeptLoginErr('נא לבחור מחלקה');return}
    const {data,error}=await supabase.from('departments').select('*').eq('id',deptSelId).single()
    if(error||!data){setDeptLoginErr('שגיאה בטעינת המחלקה');return}
    if(deptPwdInput.trim()===data.password_hash.trim()){
      setDeptIn(data); setDeptLoginErr(''); loadMyEvents(data.id)
    } else {
      setDeptLoginErr('סיסמה שגויה — פנה למנהל')
    }
  }

  function renderMonth(){
    const first=new Date(calYear,calMonth,1).getDay()
    const days=new Date(calYear,calMonth+1,0).getDate()
    const today=new Date()
    const evs=filteredEvents().filter(e=>{const d=new Date(e.date);return d.getMonth()===calMonth&&d.getFullYear()===calYear})
    const cells=[]
    for(let i=0;i<first;i++)cells.push(<div key={`p${i}`} className="ccell"/>)
    for(let d=1;d<=days;d++){
      const isT=today.getDate()===d&&today.getMonth()===calMonth&&today.getFullYear()===calYear
      const dateStr=dsStr(calYear,calMonth,d)
      const hol=HOLIDAYS[dateStr]
      const de=evs.filter(e=>e.date===dateStr)
      cells.push(
        <div key={d} className="ccell">
          <div className="ctop"><div className={`cdate${isT?' today':''}`}>{d}</div>{hol&&<div className={`holi ${hol.t}`}>✦ {hol.n}</div>}</div>
          <div className="cevs">
            {de.slice(0,2).map(ev=>{const dept=getDept(ev.department_id);if(!dept)return null;return(<div key={ev.id+(ev._virtual?ev.date:'')} className="cev" style={{background:dept.light_color,color:dept.dark_color}} onClick={()=>setViewEvent(ev)}>{ev.is_recurring?'🔄 ':''}{ev.time} {ev.title}</div>)})}
            {de.length>2&&<div className="moreev">+{de.length-2} נוספים</div>}
          </div>
        </div>
      )
    }
    const rem=(first+days)%7;if(rem>0)for(let i=0;i<7-rem;i++)cells.push(<div key={`n${i}`} className="ccell"/>)
    return(<div className="cgrid"><div className="cdh">{HD.map(d=><div key={d} className="cdl">{d}</div>)}</div><div className="cbody">{cells}</div></div>)
  }

  function renderWeek(){
    const todayDate=new Date();const sow=new Date(todayDate);sow.setDate(todayDate.getDate()-todayDate.getDay())
    const hours=[8,9,10,11,12,13,14,15,16,17,18,19,20,21]
    return(
      <div className="week-grid">
        <div style={{display:'grid',gridTemplateColumns:'46px repeat(7,1fr)',borderBottom:'1px solid var(--border)'}}>
          <div/>
          {Array.from({length:7},(_,d)=>{
            const dt=new Date(sow);dt.setDate(sow.getDate()+d)
            const isT=dt.toDateString()===todayDate.toDateString()
            const hol=HOLIDAYS[dsStr(dt.getFullYear(),dt.getMonth(),dt.getDate())]
            return(<div key={d} style={{textAlign:'center',padding:'7px 2px'}}><div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--H)'}}>{HD[d]}</div><div style={{fontSize:15,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',margin:'2px auto',borderRadius:'50%',fontFamily:'var(--H)',...(isT?{background:'var(--text)',color:'white'}:{})}}>{dt.getDate()}</div>{hol&&<div style={{fontSize:9,color:'#7a5c10',background:'var(--hol-l)',borderRadius:6,padding:'1px 4px',fontFamily:'var(--H)',display:'inline-block'}}>✦ {hol.n}</div>}</div>)
          })}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'46px repeat(7,1fr)'}}>
          <div>{hours.map(hr=><div key={hr} style={{height:44,borderTop:'1px solid var(--border)',padding:'2px 3px',fontSize:9,color:'var(--muted)'}}>{hr}:00</div>)}</div>
          {Array.from({length:7},(_,d)=>{
            const dt=new Date(sow);dt.setDate(sow.getDate()+d)
            const dateStr=dsStr(dt.getFullYear(),dt.getMonth(),dt.getDate())
            const de=filteredEvents().filter(e=>e.date===dateStr)
            const hol=HOLIDAYS[dateStr]
            return(<div key={d} className="day-col" style={{minHeight:hours.length*44,...(hol?{background:'rgba(251,243,220,0.25)'}:{})}}>{hours.map(hr=><div key={hr} className="time-slot"/>)}{de.map(ev=>{const evH=parseInt(ev.time);const top=(evH-hours[0])*44;const dept=getDept(ev.department_id);if(!dept)return null;return(<div key={ev.id+(ev._virtual?ev.date:'')} className="week-ev" style={{top:top+2,background:dept.light_color,color:dept.dark_color,borderRight:`3px solid ${dept.color}`}} onClick={()=>setViewEvent(ev)}>{ev.is_recurring?'🔄 ':''}<span style={{fontFamily:'var(--H)'}}>{ev.time}</span> {ev.title}</div>)})}</div>)
          })}
        </div>
      </div>
    )
  }

  function renderDay(){
    const today=new Date()
    const dateStr=dsStr(today.getFullYear(),today.getMonth(),today.getDate())
    const hol=HOLIDAYS[dateStr]
    const hours=Array.from({length:14},(_,i)=>i+8)
    const de=filteredEvents().filter(e=>e.date===dateStr)
    return(
      <div>
        <div style={{fontFamily:'var(--H)',fontSize:14,marginBottom:6}}>{today.getDate()} ב{HM[today.getMonth()]} {today.getFullYear()}</div>
        {hol&&<div style={{display:'inline-block',background:'var(--hol-l)',color:'#7a5c10',border:'1px solid var(--hol)',borderRadius:8,padding:'2px 10px',fontSize:11,fontFamily:'var(--H)',marginBottom:9}}>✦ {hol.n}</div>}
        <div style={{background:'white',borderRadius:14,border:'1px solid var(--border)',overflow:'hidden'}}>
          {hours.map(hr=>{
            const evs=de.filter(e=>parseInt(e.time)===hr)
            return(<div key={hr} style={{display:'grid',gridTemplateColumns:'50px 1fr',borderTop:'1px solid var(--border)',minHeight:48}}><div style={{padding:'7px 5px',fontSize:10,color:'var(--muted)',borderRight:'1px solid var(--border)'}}>{String(hr).padStart(2,'0')}:00</div><div style={{padding:'4px 7px',display:'flex',flexDirection:'column',gap:3}}>{evs.map(ev=>{const dept=getDept(ev.department_id);if(!dept)return null;return(<div key={ev.id+(ev._virtual?ev.date:'')} style={{background:dept.light_color,color:dept.dark_color,borderRight:`3px solid ${dept.color}`,padding:'4px 8px',borderRadius:8,cursor:'pointer',fontSize:11}} onClick={()=>setViewEvent(ev)}>{ev.is_recurring?'🔄 ':''}{ev.title} — {ev.location}</div>)})}</div></div>)
          })}
        </div>
      </div>
    )
  }

  function EventCard({ev}){
    const dept=getDept(ev.department_id);if(!dept)return null
    const pct=ev.spots>0?Math.round((ev.registered_count||0)/ev.spots*100):0
    return(
      <div className="ecard" onClick={()=>setViewEvent(ev)}>
        <div className="eimg" style={{background:dept.light_color}}>{ev.image_url?<img src={ev.image_url} alt={ev.title}/>:<span>{dept.emoji}</span>}<div className="ebadge" style={{background:dept.light_color,color:dept.dark_color}}>{dept.name}</div></div>
        <div className="ebody">
          <div className="etitle">{ev.is_recurring?'🔄 ':''}{ev.title}</div>
          <div className="emeta">📅 {fmtDate(ev.date)} | {ev.time}</div>
          <div className="emeta">📍 {ev.location}</div>
          {ev.price&&ev.price!=='חינם'&&<div className="emeta">🎫 {ev.price}</div>}
          {ev.spots>0&&<div className="sbar"><div className="sfill" style={{width:`${pct}%`,background:dept.color}}/></div>}
        </div>
      </div>
    )
  }

  if(loading)return(<><style>{S}</style><div style={{textAlign:'center',padding:60,color:'var(--muted)',fontFamily:'var(--B)'}}>טוען את יומן הקהילה... 🌿</div></>)

  return(
    <>
      <style>{S}</style>
      <nav className="nav">
        <div className="logo">יומן קהילתי <span>שפיים</span></div>
        <div className="nav-links">
          {[['home','ראשי'],['calendar','יומן'],['dept','נציג'],['admin','ניהול']].map(([p,l])=>(
            <button key={p} className={`nb${page===p?' active':''}`} onClick={()=>setPage(p)}>{l}</button>
          ))}
        </div>
      </nav>

      {page==='home'&&(
        <>
          <div className="hero">
            <h1>כל מה שקורה בקהילה שלנו 🌿</h1>
            <p>האירועים הקרובים, כל החודש וכל השנה</p>
            <div className="hsearch"><span style={{color:'var(--muted)'}}>🔍</span><input placeholder="חפש אירועים, קטגוריות..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/></div>
          </div>
          {searchQ.trim()&&(()=>{const q=searchQ.toLowerCase();const results=events.filter(e=>{const dept=getDept(e.department_id);return e.title.toLowerCase().includes(q)||e.location.toLowerCase().includes(q)||(dept&&dept.name.toLowerCase().includes(q))});return(<div className="sec"><div className="sec-title">תוצאות חיפוש ({results.length})</div><div className="erow">{results.length>0?results.map(ev=><EventCard key={ev.id} ev={ev}/>):<div style={{color:'var(--muted)',padding:16}}>לא נמצאו אירועים</div>}</div></div>)})()}
          <div className="sec"><div className="sec-title">קטגוריות ראשיות</div><div className="cat-grid">{depts.map(dept=>(<div key={dept.id} className="cat-card" onClick={()=>{setActiveDepts(new Set([dept.id]));setPage('calendar')}}><div className="cat-icon">{dept.emoji}</div><div className="cat-name" style={{color:dept.dark_color}}>{dept.name}</div></div>))}</div></div>
          <div className="sec" style={{paddingBottom:20}}><div className="sec-title">אירועים קרובים</div><div className="erow">{events.length===0?<div style={{color:'var(--muted)',padding:16}}>אין אירועים עדיין</div>:events.slice(0,8).map(ev=><EventCard key={ev.id} ev={ev}/>)}</div></div>
        </>
      )}

      {page==='calendar'&&(
        <div className="calwrap">
          <div className="fbar">
            <div className="ftop">
              <span className="ftitle">סינון אירועים</span>
              <button style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--muted)',fontFamily:'var(--B)'}} onClick={()=>{setActiveDepts(new Set(depts.map(d=>d.id)));setActiveAudTags(new Set(AUD_TAGS));setActiveTypeTags(new Set(TYPE_TAGS))}}>הצג הכל</button>
            </div>
            <div className="flbl">מחלקות</div>
            <div className="cbgrid">{depts.map(d=>(<label key={d.id} className="cbi"><input type="checkbox" checked={activeDepts.has(d.id)} onChange={e=>{const s=new Set(activeDepts);e.target.checked?s.add(d.id):s.delete(d.id);setActiveDepts(s)}}/><div className="cdot" style={{background:d.color}}/><span>{d.name}</span></label>))}</div>
            <div className="flbl">קהל יעד</div>
            <div className="cbgrid3">{AUD_TAGS.map(t=>(<label key={t} className="cbi"><input type="checkbox" checked={activeAudTags.has(t)} onChange={e=>{const s=new Set(activeAudTags);e.target.checked?s.add(t):s.delete(t);setActiveAudTags(s)}}/><span>{t}</span></label>))}</div>
            <div className="flbl">אופי האירוע</div>
            <div className="cbgrid3">{TYPE_TAGS.map(t=>(<label key={t} className="cbi"><input type="checkbox" checked={activeTypeTags.has(t)} onChange={e=>{const s=new Set(activeTypeTags);e.target.checked?s.add(t):s.delete(t);setActiveTypeTags(s)}}/><span>{t}</span></label>))}</div>
            <div style={{marginTop:10}}><div className="flbl">חגים</div><div style={{display:'flex',gap:10,fontSize:11}}><span style={{background:'var(--hol-l)',color:'#7a5c10',padding:'2px 8px',borderRadius:6,border:'1px solid var(--hol)'}}>✦ יום חג</span><span style={{background:'var(--hol-e)',color:'#7a5000',padding:'2px 8px',borderRadius:6,border:'1px dashed var(--hol)'}}>✦ ערב חג</span>{!holidaysLoaded&&<span style={{color:'var(--muted)',fontSize:10}}>טוען...</span>}</div></div>
          </div>
          <div className="cnav">
            <button className="cnbtn" onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1)}else setCalMonth(m=>m-1)}}>›</button>
            <span className="clbl">{HM[calMonth]} {calYear}</span>
            <button className="cnbtn" onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1)}else setCalMonth(m=>m+1)}}>‹</button>
            <div className="vtabs">{['month','week','day'].map((v,i)=>(<button key={v} className={`vt${calView===v?' active':''}`} onClick={()=>setCalView(v)}>{['חודש','שבוע','יום'][i]}</button>))}</div>
          </div>
          {calView==='month'&&renderMonth()}
          {calView==='week'&&renderWeek()}
          {calView==='day'&&renderDay()}
        </div>
      )}

      {page==='dept'&&(
        <div style={{padding:20}}>
          {!deptIn?(
            <div style={{maxWidth:380,margin:'30px auto'}}>
              <div className="card">
                <div className="card-title">כניסת נציג מחלקה</div>
                <div style={{fontSize:12,color:'var(--muted)',marginBottom:12}}>בחר את המחלקה שלך והכנס את הסיסמה שקיבלת מהמנהל</div>
                <select className="inp" value={deptSelId} onChange={e=>setDeptSelId(e.target.value)}><option value="">בחר מחלקה...</option>{depts.map(d=><option key={d.id} value={d.id}>{d.emoji} {d.name}</option>)}</select>
                <input className="inp" type="password" placeholder="סיסמת מחלקה" value={deptPwdInput} onChange={e=>{setDeptPwdInput(e.target.value);setDeptLoginErr('')}} onKeyDown={e=>e.key==='Enter'&&doDeptLogin()}/>
                {deptLoginErr&&<div className="err">{deptLoginErr}</div>}
                <button type="button" className="btn" style={{width:'100%'}} onClick={doDeptLogin}>כניסה</button>
              </div>
            </div>
          ):(
            <>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                <h2 style={{fontFamily:'var(--H)',fontSize:18}}>{deptIn.emoji} {deptIn.name}</h2>
                <div style={{display:'flex',gap:8}}>
                  <button type="button" className="btn" style={{background:deptIn.dark_color}} onClick={()=>setShowAddEv(true)}>+ הוסף אירוע</button>
                  <button type="button" className="btn-out" onClick={()=>{setDeptIn(null);setDeptPwdInput('');setDeptSelId('');setMyEvents([])}}>יציאה</button>
                </div>
              </div>
              <div className="card">
                <div className="card-title">האירועים שלי ({myEvents.length})</div>
                {myEvents.length===0&&<div style={{color:'var(--muted)',fontSize:13}}>אין אירועים — לחץ על "הוסף אירוע"</div>}
                {myEvents.map(ev=>(
                  <div key={ev.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:'var(--H)',fontSize:13,marginBottom:3}}>{ev.is_recurring?'🔄 ':''}{ev.title}</div>
                        {ev.is_recurring&&<div style={{fontSize:11,color:'#7a4a4e',background:'#F0E5E6',borderRadius:6,padding:'2px 8px',display:'inline-block',marginBottom:4}}>{ev.recurrence_type==='weekly'?`כל ${HD[ev.recurrence_day_of_week]}`:`כל ה-${ev.recurrence_day_of_month} לחודש`} עד {fmtDate(ev.recurrence_end_date)}</div>}
                        <div style={{fontSize:11,color:'var(--muted)',marginBottom:6}}>{fmtDate(ev.date)} | {ev.time} | {ev.location}</div>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <div style={{background:deptIn.light_color,color:deptIn.dark_color,padding:'3px 10px',borderRadius:8,fontSize:11,fontFamily:'var(--H)'}}>👥 {ev.registered_count||0} נרשמים{ev.spots>0?` / ${ev.spots}`:''}</div>
                          <button type="button" style={{padding:'3px 10px',background:'#E6F0E5',color:'#4a6e49',border:'none',borderRadius:8,cursor:'pointer',fontSize:11,fontFamily:'var(--H)'}} onClick={()=>setViewRegsFor(ev)}>📋 רשימת נרשמים</button>
                        </div>
                        {ev.tags&&ev.tags.length>0&&<div style={{marginTop:6}}>{ev.tags.map(t=><span key={t} style={{fontSize:10,background:'#F5ECD8',color:'#8a6e3a',padding:'1px 7px',borderRadius:10,marginLeft:4}}>{t}</span>)}</div>}
                      </div>
                      <button type="button" className="btn-sm" style={{background:'#c0392b',flexShrink:0}} onClick={()=>deleteEvent(ev.id)}>מחק</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {page==='admin'&&(
        <div style={{padding:20}}>
          {!adminIn?(
            <div style={{maxWidth:320,margin:'30px auto'}}>
              <div className="card">
                <div className="card-title">כניסת מנהל ראשי</div>
                <input className="inp" type="password" placeholder="סיסמת מנהל" value={adminPwdInput} onChange={e=>{setAdminPwdInput(e.target.value);setAdminErr('')}} onKeyDown={e=>e.key==='Enter'&&doAdminLogin()}/>
                {adminErr&&<div className="err">{adminErr}</div>}
                <button type="button" className="btn" style={{width:'100%'}} onClick={doAdminLogin}>כניסה</button>
              </div>
            </div>
          ):(
            <>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                <h2 style={{fontFamily:'var(--H)',fontSize:18}}>ניהול יומן קהילתי</h2>
                <button type="button" className="btn-out" onClick={()=>{setAdminIn(false);setAdminPwdInput('')}}>יציאה</button>
              </div>
              <div className="card">
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <div className="card-title" style={{margin:0}}>🏢 ניהול מחלקות</div>
                  <button type="button" className="btn-sm" style={{background:'#4a6e49'}} onClick={()=>setShowAddDept(!showAddDept)}>{showAddDept?'סגור':'+ הוסף מחלקה'}</button>
                </div>
                {showAddDept&&(
                  <div style={{background:'var(--bg)',borderRadius:10,padding:12,marginBottom:12,border:'1px solid var(--border)'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 80px',gap:8,marginBottom:8}}>
                      <input className="inp" placeholder="שם המחלקה *" style={{margin:0}} value={newDept.name} onChange={e=>setNewDept({...newDept,name:e.target.value})}/>
                      <input className="inp" placeholder="אמוג׳י" style={{margin:0}} value={newDept.emoji} onChange={e=>setNewDept({...newDept,emoji:e.target.value})}/>
                    </div>
                    <input className="inp" type="password" placeholder="סיסמה לנציג *" style={{margin:0,marginBottom:8}} value={newDept.password} onChange={e=>setNewDept({...newDept,password:e.target.value})}/>
                    <div style={{marginBottom:8}}><div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>צבע מחלקה</div><div style={{display:'flex',flexWrap:'wrap',gap:4}}>{COLOR_OPTS.map(c=><div key={c} className={`color-opt${newDept.color===c?' sel':''}`} style={{background:c}} onClick={()=>setNewDept({...newDept,color:c})}/>)}</div></div>
                    {deptMsg&&<div className={deptMsg.includes('שגיאה')?'err':'suc'}>{deptMsg}</div>}
                    <button type="button" className="btn-sm" style={{background:'#4a6e49',marginTop:8}} onClick={addDept}>הוסף מחלקה</button>
                  </div>
                )}
                {depts.map(d=>(
                  <div key={d.id}>
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:d.color,flexShrink:0}}/>
                      <span style={{flex:1,fontFamily:'var(--B)'}}>{d.emoji} {d.name}</span>
                      <span style={{fontSize:11,color:'var(--muted)',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,padding:'2px 8px'}}>••••••</span>
                      <button type="button" className="btn-sm" style={{background:'var(--text)'}} onClick={()=>{setChangePwdFor(d.id===changePwdFor?null:d.id);setNewPwdVal('');setPwdMsg('')}}>שנה סיסמה</button>
                      <button type="button" className="btn-sm" style={{background:'#c0392b'}} onClick={()=>deleteDept(d.id)}>הסר</button>
                    </div>
                    {changePwdFor===d.id&&(
                      <div style={{padding:10,background:'var(--bg)',borderRadius:8,marginBottom:4,border:'1px solid var(--border)'}}>
                        <div style={{fontSize:11,color:'var(--muted)',marginBottom:6}}>סיסמה חדשה עבור: <strong>{d.name}</strong></div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'end'}}>
                          <input className="inp" type="password" placeholder="לפחות 4 תווים" style={{margin:0}} value={newPwdVal} onChange={e=>{setNewPwdVal(e.target.value);setPwdMsg('')}}/>
                          <button type="button" className="btn-sm" style={{background:'#4a6e49'}} onClick={()=>changePassword(d.id)}>שמור</button>
                        </div>
                        {pwdMsg&&<div className={pwdMsg.includes('שגיאה')?'err':'suc'} style={{marginTop:6}}>{pwdMsg}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="card-title">📊 סטטיסטיקות</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                  {[['אירועים',events.length],['מחלקות',depts.length],['נרשמים',events.reduce((s,e)=>s+(e.registered_count||0),0)]].map(([l,v])=>(
                    <div key={l} style={{background:'var(--bg)',borderRadius:10,padding:12,textAlign:'center'}}>
                      <div style={{fontSize:11,color:'var(--muted)',marginBottom:4}}>{l}</div>
                      <div style={{fontSize:22,fontFamily:'var(--H)'}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {viewEvent&&(()=>{const dept=getDept(viewEvent.department_id);if(!dept)return null;return(<EventViewModal ev={viewEvent} dept={dept} onClose={()=>setViewEvent(null)} onRegister={()=>{setRegEvent(viewEvent);setViewEvent(null)}}/>)})()}
      {regEvent&&(()=>{const dept=getDept(regEvent.department_id);if(!dept)return null;return(<RegModal ev={regEvent} dept={dept} onClose={()=>setRegEvent(null)} onSuccess={()=>setRegEvent(null)}/>)})()}
      {showAddEv&&deptIn&&<AddEventModal deptIn={deptIn} onClose={()=>{setShowAddEv(false);setEvMsg('')}} onSubmit={handleAddEvent} msg={evMsg}/>}
      {viewRegsFor&&deptIn&&(()=>{const dept=getDept(viewRegsFor.department_id);if(!dept)return null;return(<RegListModal ev={viewRegsFor} dept={dept} onClose={()=>setViewRegsFor(null)}/>)})()}
    </>
  )
}