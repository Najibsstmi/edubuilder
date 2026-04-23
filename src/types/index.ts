export type AppRole = 'master_admin' | 'admin' | 'user';
export type AccountType = 'free' | 'full';
export type ProfileStatus = 'active' | 'pending' | 'approved' | 'suspended';

export interface School {
  id: string;
  school_code: string | null;
  school_name: string;
  school_type: string | null;
  state_name: string | null;
  ppd_name: string | null;
  district_name: string | null;
  is_secondary: boolean;
  is_active: boolean;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  account_type: AccountType;
  status: ProfileStatus;
  school_id: string | null;
  state_name: string | null;
  ppd_name: string | null;
  school_type: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

export interface Item {
  id: string;
  item_code: string;
  tingkatan: 4 | 5;
  paper: 'paper_1' | 'paper_2';
  section: 'A' | 'B' | 'C' | null;
  item_type: 'mcq' | 'structured' | 'limited_response' | 'open_response';
  theme_name: string | null;
  bidang_learning_code: string | null;
  bidang_learning_name: string | null;
  main_construct: string;
  construct_code: string | null;
  difficulty_level: 'rendah' | 'sederhana' | 'tinggi';
  marks: number;
  stem_text: string;
  answer_scheme_text: string;
  answer_final: string | null;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'published';
  source_type: string | null;
  source_reference: string | null;
  source_year: number | null;
  source_school: string | null;
}
