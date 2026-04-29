# EduBuilder Database Audit

Tarikh audit: 2026-04-30

Dokumen ini merumuskan struktur data yang kod semasa jangka daripada Supabase. Tujuannya ialah menjadi rujukan semasa kita kemaskan schema, RLS, dan migration sebenar.

## Keputusan Penting

- `items.paper` dan `build_sets.paper` menggunakan enum `paper_type`: `paper_1` atau `paper_2`.
- Route rasmi untuk input item ialah `/masukkan-soalan`. Route lama `/admin/items/new` kini redirect ke page yang sama.
- Route rasmi untuk bina set ialah `/builder-set`. Route lama `/build` redirect ke page yang sama.
- Status item yang digunakan di UI: `draft`, `pending_review`, `approved`, `rejected`, `published`, `archived`.
- Kandungan item perlu kekal rich HTML untuk menyokong jadual, rajah, gambar, dan pilihan jawapan bergambar.

## Tables Yang Sedang Digunakan

### `profiles`

Digunakan untuk auth profile, role, sekolah, status kelulusan, dan jenis akaun.

Field penting:

- `id`
- `full_name`
- `email`
- `role`: `master_admin`, `admin`, `user`
- `account_type`: `free`, `full`
- `status`: `active`, `pending`, `suspended`
- `school_id`
- `state_name`
- `ppd_name`
- `school_type`
- `approved_by`
- `approved_at`

### `schools`

Digunakan semasa signup untuk pilihan negeri, PPD, dan sekolah menengah aktif.

Field penting:

- `id`
- `school_code`
- `school_name`
- `school_type`
- `state_name`
- `ppd_name`
- `district_name`
- `is_secondary`
- `is_active`

### `items`

Ini table teras bank soalan.

Field penting:

- `id`
- `item_code`
- `created_by`
- `updated_by`
- `tingkatan`: `4` atau `5`
- `paper`: `paper_1` atau `paper_2`
- `section`: `A`, `B`, `C`, atau `null`
- `question_no_reference`: untuk Kertas 2 terutama nombor 11, 12, 13
- `item_type`: `mcq`, `structured`, `limited_response`, `open_response`
- `marks`
- `theme_name`
- `bidang_learning_code`
- `bidang_learning_name`
- `standard_kandungan`
- `standard_pembelajaran`
- `main_construct`
- `construct_code`
- `difficulty_level`: `rendah`, `sederhana`, `tinggi`
- `stimulus_type`
- `question_instruction`
- `stem_text`
- `answer_scheme_text`
- `answer_final`
- `explanation_text`
- `source_type`
- `source_reference`
- `source_year`
- `source_school`
- `status`
- `approved_by`
- `approved_at`
- `published_by`
- `published_at`

### `item_options`

Pilihan jawapan untuk Kertas 1.

Field penting:

- `id`
- `item_id`
- `option_label`: `A`, `B`, `C`, `D`
- `option_text`
- `is_correct`
- `display_order`

### `academic_standards`

Senarai DPK/DSKP Tingkatan 4 dan 5 untuk dropdown metadata akademik.

Field penting:

- `tingkatan`
- `theme_name`
- `bidang_code`
- `bidang_name`
- `standard_kandungan_code`
- `standard_kandungan_name`
- `standard_pembelajaran_code`
- `standard_pembelajaran_name`

### `constructs`

Senarai konstruk dan aspek rasmi.

Field penting:

- `construct_group`
- `construct_code`
- `aspect_name`

### `build_sets` dan `build_set_items`

Digunakan oleh page rasmi `Bina Set Soalan`.

Field penting `build_sets`:

- `id`
- `owner_profile_id`
- `guest_session_id`
- `title`
- `build_mode`: `full_exam`, `topical_practice`, `section_practice`, `construct_practice`, `difficulty_practice`
- `tingkatan`
- `paper`: `paper_1` atau `paper_2`
- `section`
- `status`: `draft`, `completed`, `exported`
- `instructions_text`

Field penting `build_set_items`:

- `build_set_id`
- `item_id`
- `section`
- `custom_question_no`
- `marks`
- `display_order`

### `question_sets` dan `question_set_items`

Table legacy daripada builder lama. Kod semasa tidak bergantung pada table ini kerana `question_sets.paper` masih integer, manakala model aktif menggunakan `paper_type`.

## Isu Yang Perlu Diselesaikan Seterusnya

1. Kekalkan `build_sets` sebagai model rasmi, atau migrate/arkibkan `question_sets` supaya tidak mengelirukan.
2. Tambah workflow review yang lebih jelas: `draft` -> `pending_review` -> `approved` -> `published` atau `rejected`.
3. Paparkan pilihan jawapan MCQ dalam preview Bank Soalan Admin.
4. Tambah `item_media` atau polisi storage untuk bucket `item-media` supaya upload gambar RichEditor stabil.
5. Tambah migration SQL rasmi supaya schema boleh dibina semula dengan konsisten.
6. Tambah export model untuk Word/PDF selepas item dan builder stabil.
