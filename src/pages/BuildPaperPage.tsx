import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { ItemSummary } from '../types';

export function BuildPaperPage() {
  const { profile, user } = useAuth();
  const [paper, setPaper] = useState<'paper_1' | 'paper_2'>('paper_1');
  const [section, setSection] = useState<'A' | 'B' | 'C' | ''>('');
  const [tingkatan, setTingkatan] = useState<4 | 5>(4);
  const [construct, setConstruct] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState('Set Latihan Sains');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadItems = async () => {
      let query = supabase
        .from('items')
        .select(`
          id,
          item_code,
          tingkatan,
          paper,
          section,
          question_no_reference,
          item_type,
          main_construct,
          construct_code,
          difficulty_level,
          marks,
          status,
          stem_text,
          created_at
        `)
        .eq('status', 'published')
        .eq('tingkatan', tingkatan)
        .eq('paper', paper)
        .order('created_at', { ascending: false })
        .limit(50);
      if (section) query = query.eq('section', section);
      if (construct) query = query.eq('main_construct', construct);
      if (difficulty) query = query.eq('difficulty_level', difficulty);
      const { data, error } = await query;
      if (error) {
        setMessage(error.message);
        return;
      }
      setItems((data || []) as ItemSummary[]);
    };
    void loadItems();
  }, [paper, section, tingkatan, construct, difficulty]);

  const limits = useMemo(() => {
    if (profile?.account_type === 'full') return null;
    return { k1: 10, k2a: 4, k2b: 2, k2c: 1 };
  }, [profile?.account_type]);

  const currentLimitText = useMemo(() => {
    if (!limits) return 'Full user: tiada had.';
    if (paper === 'paper_1') return 'Free user: maks 10 soalan objektif.';
    if (section === 'A') return 'Free user: maks 4 soalan Bahagian A.';
    if (section === 'B') return 'Free user: maks 2 soalan Bahagian B.';
    if (section === 'C') return 'Free user: maks 1 soalan Bahagian C (Soalan 11).';
    return 'Pilih bahagian untuk lihat had free user.';
  }, [limits, paper, section]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(id);
      if (exists) return prev.filter((value) => value !== id);

      if (limits) {
        const total = prev.length + 1;
        if (paper === 'paper_1' && total > limits.k1) {
          alert('Free user hanya boleh pilih 10 soalan objektif.');
          return prev;
        }
        if (paper === 'paper_2' && section === 'A' && total > limits.k2a) {
          alert('Free user hanya boleh pilih 4 soalan Bahagian A.');
          return prev;
        }
        if (paper === 'paper_2' && section === 'B' && total > limits.k2b) {
          alert('Free user hanya boleh pilih 2 soalan Bahagian B.');
          return prev;
        }
        if (paper === 'paper_2' && section === 'C' && total > limits.k2c) {
          alert('Free user hanya boleh pilih 1 soalan Bahagian C.');
          return prev;
        }
      }

      return [...prev, id];
    });
  };

  const createBuildSet = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setMessage('');

    if (selectedIds.length === 0) {
      setMessage('Pilih sekurang-kurangnya satu item sebelum simpan set.');
      return;
    }

    const { data: buildData, error: buildError } = await supabase
      .from('build_sets')
      .insert({
        owner_profile_id: user.id,
        title,
        build_mode: 'section_practice',
        tingkatan,
        paper,
        section: section || null,
        status: 'draft',
      })
      .select('id')
      .single();

    if (buildError || !buildData) {
      setMessage(buildError?.message || 'Gagal bina set.');
      return;
    }

    const rows = selectedIds.map((itemId, index) => ({
      build_set_id: buildData.id,
      item_id: itemId,
      section: section || null,
      custom_question_no: String(index + 1),
      display_order: index + 1,
      marks: items.find((item) => item.id === itemId)?.marks ?? 1,
    }));

    const { error: itemError } = await supabase.from('build_set_items').insert(rows);
    if (itemError) {
      setMessage(itemError.message);
      return;
    }

    setMessage('Set berjaya dibina sebagai draft. Export PDF/Word boleh disambung kemudian.');
    setSelectedIds([]);
  };

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1>Bina set soalan</h1>
          <p className="muted">Mode fleksibel: guru boleh bina ikut kertas, bahagian, konstruk dan aras.</p>
        </div>
      </div>

      <form className="card page-form" onSubmit={createBuildSet}>
        <div className="grid-4">
          <label>
            Tajuk set
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
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
            <select value={paper} onChange={(e) => { setPaper(e.target.value as 'paper_1' | 'paper_2'); setSection(''); setSelectedIds([]); }}>
              <option value="paper_1">Kertas 1</option>
              <option value="paper_2">Kertas 2</option>
            </select>
          </label>
          <label>
            Bahagian
            <select value={section} onChange={(e) => { setSection(e.target.value as any); setSelectedIds([]); }}>
              <option value="">-</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </label>
        </div>

        <div className="grid-2">
          <label>
            Konstruk
            <input value={construct} onChange={(e) => setConstruct(e.target.value)} placeholder="contoh: mengaplikasi" />
          </label>
          <label>
            Aras
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">Semua</option>
              <option value="rendah">Rendah</option>
              <option value="sederhana">Sederhana</option>
              <option value="tinggi">Tinggi</option>
            </select>
          </label>
        </div>

        <p className="muted">{currentLimitText}</p>

        <div className="item-list">
          {items.map((item) => (
            <label key={item.id} className="item-card">
              <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} />
              <div>
                <strong>{item.item_code}</strong>
                <p>{item.stem_text.slice(0, 180)}...</p>
                <small>{item.main_construct} · {item.difficulty_level} · {item.marks} markah</small>
              </div>
            </label>
          ))}
        </div>

        <div className="action-row">
          <button className="primary-btn">Simpan set</button>
          <span className="muted">Dipilih: {selectedIds.length}</span>
        </div>
        {message && <p className="muted">{message}</p>}
      </form>
    </div>
  );
}
