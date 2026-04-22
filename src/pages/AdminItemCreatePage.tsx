import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const constructSuggestions = [
  'mengingat',
  'memahami',
  'mengaplikasi',
  'menganalisis',
  'menilai',
  'mencipta',
  'kemahiran_proses_sains',
];

function simpleAiSuggest(stem: string, paper: 'paper_1' | 'paper_2') {
  const text = stem.toLowerCase();
  if (text.includes('ramalkan') || text.includes('predict')) return { construct: 'menganalisis', difficulty: 'sederhana', reason: 'Ada elemen tafsir data / ramalan.' };
  if (text.includes('hitung') || text.includes('calculate')) return { construct: 'mengaplikasi', difficulty: 'sederhana', reason: 'Perlu guna formula atau pengetahuan dalam situasi.' };
  if (text.includes('cadangkan') || text.includes('justifikasi') || text.includes('wajarkan')) return { construct: 'menilai', difficulty: 'tinggi', reason: 'Perlu pertimbangan dan justifikasi.' };
  if (paper === 'paper_2') return { construct: 'memahami', difficulty: 'sederhana', reason: 'Default cadangan untuk soalan subjektif umum.' };
  return { construct: 'mengingat', difficulty: 'rendah', reason: 'Nampak seperti item pengetahuan asas.' };
}

export function AdminItemCreatePage() {
  const { profile, user } = useAuth();
  const [itemCode, setItemCode] = useState('');
  const [tingkatan, setTingkatan] = useState<4 | 5>(4);
  const [paper, setPaper] = useState<'paper_1' | 'paper_2'>('paper_1');
  const [section, setSection] = useState<'A' | 'B' | 'C' | ''>('');
  const [itemType, setItemType] = useState<'mcq' | 'structured' | 'limited_response' | 'open_response'>('mcq');
  const [construct, setConstruct] = useState('mengingat');
  const [difficulty, setDifficulty] = useState<'rendah' | 'sederhana' | 'tinggi'>('rendah');
  const [marks, setMarks] = useState(1);
  const [stemText, setStemText] = useState('');
  const [answerFinal, setAnswerFinal] = useState('');
  const [answerScheme, setAnswerScheme] = useState('');
  const [sourceType, setSourceType] = useState('teacher_original');
  const [sourceReference, setSourceReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [aiRemaining] = useState(20);

  if (!profile || (profile.role !== 'admin' && profile.role !== 'master_admin')) {
    return <div className="card">Akses hanya untuk admin atau master admin.</div>;
  }

  const runAi = async () => {
    const suggestion = simpleAiSuggest(stemText, paper);
    setConstruct(suggestion.construct);
    setDifficulty(suggestion.difficulty as 'rendah' | 'sederhana' | 'tinggi');
    setMessage(`Bantuan AI: ${suggestion.reason}`);

    if (user) {
      await supabase.from('ai_usage_logs').insert({
        profile_id: user.id,
        usage_type: 'suggest_construct',
        input_snapshot: { stemText, paper },
        output_snapshot: suggestion,
      });
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage('');

    const { error } = await supabase.from('items').insert({
      item_code: itemCode,
      created_by: user.id,
      updated_by: user.id,
      tingkatan,
      paper,
      section: section || null,
      item_type: itemType,
      main_construct: construct,
      difficulty_level: difficulty,
      marks,
      stem_text: stemText,
      answer_final: answerFinal || null,
      answer_scheme_text: answerScheme,
      source_type: sourceType,
      source_reference: sourceReference || null,
      status: 'draft',
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Item berjaya disimpan sebagai draft.');
    setItemCode('');
    setStemText('');
    setAnswerFinal('');
    setAnswerScheme('');
  };

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1>Masukkan soalan</h1>
          <p className="muted">Panduan pemarkahan wajib diisi. Butang Bantuan AI hanya cadang, bukan muktamad.</p>
        </div>
      </div>

      <form className="card page-form" onSubmit={onSubmit}>
        <div className="grid-4">
          <label>
            Kod item
            <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} required />
          </label>
          <label>
            Tingkatan
            <select value={tingkatan} onChange={(e) => setTingkatan(Number(e.target.value) as 4 | 5)}>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </label>
          <label>
            Kertas
            <select value={paper} onChange={(e) => setPaper(e.target.value as 'paper_1' | 'paper_2')}>
              <option value="paper_1">Kertas 1</option>
              <option value="paper_2">Kertas 2</option>
            </select>
          </label>
          <label>
            Bahagian
            <select value={section} onChange={(e) => setSection(e.target.value as 'A' | 'B' | 'C' | '')}>
              <option value="">-</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </label>
        </div>

        <div className="grid-4">
          <label>
            Jenis item
            <select value={itemType} onChange={(e) => setItemType(e.target.value as any)}>
              <option value="mcq">MCQ</option>
              <option value="structured">Structured</option>
              <option value="limited_response">Limited response</option>
              <option value="open_response">Open response</option>
            </select>
          </label>
          <label>
            Konstruk
            <select value={construct} onChange={(e) => setConstruct(e.target.value)}>
              {constructSuggestions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Aras
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}>
              <option value="rendah">Rendah</option>
              <option value="sederhana">Sederhana</option>
              <option value="tinggi">Tinggi</option>
            </select>
          </label>
          <label>
            Markah
            <input type="number" min={1} value={marks} onChange={(e) => setMarks(Number(e.target.value))} required />
          </label>
        </div>

        <label>
          Stem soalan
          <textarea rows={6} value={stemText} onChange={(e) => setStemText(e.target.value)} required />
        </label>

        <div className="grid-2">
          <label>
            Jawapan akhir (MCQ atau ringkas)
            <input value={answerFinal} onChange={(e) => setAnswerFinal(e.target.value)} />
          </label>
          <label>
            Sumber item
            <input value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} placeholder="Contoh: Percubaan Johor 2025" />
          </label>
        </div>

        <label>
          Panduan pemarkahan / skema jawapan
          <textarea rows={8} value={answerScheme} onChange={(e) => setAnswerScheme(e.target.value)} required />
        </label>

        <label>
          Jenis sumber
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            <option value="teacher_original">Teacher original</option>
            <option value="trial_exam">Trial exam</option>
            <option value="module">Module</option>
            <option value="past_year_style">Past year style</option>
          </select>
        </label>

        <div className="action-row">
          <button type="button" className="ghost-btn" onClick={() => void runAi()}>Bantuan AI (baki {aiRemaining})</button>
          <button className="primary-btn" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan item'}</button>
        </div>
        {message && <p className="muted">{message}</p>}
      </form>
    </div>
  );
}
