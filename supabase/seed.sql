-- TunDee Seed Data
-- Run AFTER schema.sql

-- ─────────────────────────────────────────────
-- Checklist Steps
-- ─────────────────────────────────────────────
insert into scholarship_checklist_steps (id, step_number, name_th, name_en, description_th, description_en) values
(1, 1, 'ยืนยันคุณสมบัติ', 'Confirm Eligibility',
  'ตรวจสอบเกรด รายได้ครอบครัว และเงื่อนไขอื่น ๆ ให้ครบถ้วนก่อนสมัคร',
  'Check your GPA, family income, and other requirements before applying'),
(2, 2, 'รวบรวมเอกสาร', 'Gather Documents',
  'เตรียมเอกสารทุกอย่าง เช่น ใบแสดงผลการเรียน สำเนาบัตรประชาชน และหนังสือรับรองรายได้',
  'Prepare all required documents: transcript, ID copy, income certificate'),
(3, 3, 'เขียนเรียงความ', 'Write Personal Statement',
  'เขียนเรียงความหรือจดหมายแนะนำตัวเองที่สะท้อนความตั้งใจและเป้าหมายของคุณ',
  'Write an essay or statement that reflects your motivation and goals'),
(4, 4, 'ขอจดหมายแนะนำ', 'Get Recommendation Letter',
  'ติดต่ออาจารย์หรือผู้บังคับบัญชาเพื่อขอจดหมายแนะนำอย่างน้อย 2 สัปดาห์ล่วงหน้า',
  'Contact a teacher or supervisor for a recommendation letter at least 2 weeks in advance'),
(5, 5, 'สมัครบนเว็บไซต์ทุน', 'Submit Application Online',
  'กรอกใบสมัครและอัปโหลดเอกสารทั้งหมดบนระบบออนไลน์ของผู้ให้ทุน',
  'Fill in the application form and upload all documents on the funder''s online system'),
(6, 6, 'ยืนยันการส่งใบสมัคร', 'Confirm Submission',
  'บันทึกหมายเลขอ้างอิงและตรวจสอบอีเมลยืนยันจากผู้ให้ทุน',
  'Save your reference number and check for a confirmation email from the funder'),
(7, 7, 'รายงานผล', 'Report Outcome',
  'แจ้งผลการสมัครให้ครอบครัวและโรงเรียนทราบ และเตรียมเอกสารสำหรับขั้นตอนถัดไป',
  'Inform your family and school of the result, and prepare documents for next steps');

-- ─────────────────────────────────────────────
-- Scholarships (15 realistic Thai scholarships)
-- ─────────────────────────────────────────────

-- 1. EEF Tee-Lay (กสศ. ทุนเสมอภาค)
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนเสมอภาค กสศ.',
  'EEF Equitable Education Fund Scholarship',
  'กองทุนเพื่อความเสมอภาคทางการศึกษา (กสศ.)',
  'Equitable Education Fund (EEF)',
  'government',
  3500, 'monthly', null, 100000,
  array['any'], array['national'], true,
  '2025-03-31',
  'https://www.eef.or.th',
  array['สำเนาบัตรประชาชน','สำเนาทะเบียนบ้าน','หนังสือรับรองรายได้ครอบครัว','บัตรสวัสดิการแห่งรัฐ (ถ้ามี)','ใบแสดงผลการเรียน'],
  'ทุนเสมอภาคจาก กสศ. มุ่งช่วยเหลือนักเรียนจากครอบครัวรายได้น้อยทั่วประเทศ ให้ได้รับโอกาสทางการศึกษาที่เท่าเทียม โดยให้ทุนรายเดือน 3,500 บาท สำหรับนักเรียนชั้น ม.4–ม.6 และอุดมศึกษา ผู้มีบัตรสวัสดิการแห่งรัฐได้รับสิทธิ์พิจารณาก่อน',
  'The EEF Equitable Education Fund supports low-income students nationwide with a monthly stipend of 3,500 THB. Targeting upper secondary and university students, it prioritizes those holding the State Welfare Card to reduce educational inequality.',
  now()
);

-- 2. SCB Foundation Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนมูลนิธิธนาคารไทยพาณิชย์',
  'SCB Foundation Scholarship',
  'มูลนิธิธนาคารไทยพาณิชย์',
  'SCB Foundation',
  'corporate',
  30000, 'annual', 2.75, 200000,
  array['any'], array['national'], false,
  '2025-04-30',
  'https://www.scbfoundation.com',
  array['ใบแสดงผลการเรียน','สำเนาบัตรประชาชน','หนังสือรับรองรายได้ครอบครัว','เรียงความแนะนำตัว','จดหมายแนะนำจากอาจารย์'],
  'ทุนการศึกษาจากมูลนิธิธนาคารไทยพาณิชย์ มอบให้แก่นักศึกษาระดับปริญญาตรีทุกสาขาวิชาที่มีผลการเรียนดี มีความประพฤติดี และมีความต้องการทางการเงิน ทุนละ 30,000 บาทต่อปี',
  'The SCB Foundation Scholarship supports undergraduate students in any field with good academic records and financial need. Recipients receive 30,000 THB annually and are encouraged to give back to their communities.',
  now()
);

-- 3. PTT Engineering Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุน ปตท. สาขาวิศวกรรมศาสตร์',
  'PTT Engineering Scholarship',
  'บริษัท ปตท. จำกัด (มหาชน)',
  'PTT Public Company Limited',
  'corporate',
  40000, 'annual', 3.00, null,
  array['วิศวกรรมศาสตร์','วิศวกรรมเคมี','วิศวกรรมปิโตรเลียม','วิศวกรรมสิ่งแวดล้อม'], array['national'], false,
  '2025-05-15',
  'https://www.pttplc.com/scholarship',
  array['ใบแสดงผลการเรียน','สำเนาบัตรประชาชน','portfolio หรือโครงงาน (ถ้ามี)','เรียงความ','จดหมายแนะนำ 2 ฉบับ'],
  'ปตท. มอบทุนการศึกษาสำหรับนักศึกษาระดับปริญญาตรีสาขาวิศวกรรมศาสตร์และสาขาที่เกี่ยวข้อง เพื่อพัฒนาบุคลากรด้านพลังงานของประเทศ ทุนละ 40,000 บาทต่อปี พร้อมโอกาสฝึกงานกับ ปตท.',
  'PTT offers engineering scholarships to support the development of Thailand''s energy sector workforce. Recipients receive 40,000 THB annually plus internship opportunities at PTT. Fields include chemical, petroleum, and environmental engineering.',
  now()
);

-- 4. Mahidol University Entrance Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนเข้าใหม่มหาวิทยาลัยมหิดล',
  'Mahidol University Entrance Scholarship',
  'มหาวิทยาลัยมหิดล',
  'Mahidol University',
  'university',
  25000, 'annual', 3.50, null,
  array['วิทยาศาสตร์','แพทยศาสตร์','เภสัชศาสตร์','พยาบาลศาสตร์','สาธารณสุขศาสตร์'], array['national'], false,
  '2025-06-30',
  'https://www.mahidol.ac.th/scholarship',
  array['ใบแสดงผลการเรียน (GPAX)','สำเนาบัตรประชาชน','Portfolio','เรียงความ (ภาษาอังกฤษ)'],
  'ทุนเข้าใหม่ของมหาวิทยาลัยมหิดล สำหรับนักศึกษาใหม่ที่มีผลการเรียนดีเยี่ยม GPAX ไม่ต่ำกว่า 3.50 ในสาขาวิทยาศาสตร์สุขภาพและวิทยาศาสตร์บริสุทธิ์',
  'Mahidol University''s entrance scholarship for top incoming students in health sciences and pure science programs, requiring a minimum GPAX of 3.50. Recipients receive 25,000 THB per year.',
  now()
);

-- 5. Chulalongkorn University Merit Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนเรียนดีจุฬาลงกรณ์มหาวิทยาลัย',
  'Chulalongkorn University Merit Scholarship',
  'จุฬาลงกรณ์มหาวิทยาลัย',
  'Chulalongkorn University',
  'university',
  20000, 'annual', 3.50, null,
  array['any'], array['national'], false,
  '2025-07-31',
  'https://www.chula.ac.th/scholarship',
  array['ใบแสดงผลการเรียน','สำเนาบัตรประชาชน','หนังสือรับรองจากอาจารย์ที่ปรึกษา'],
  'ทุนเรียนดีของจุฬาลงกรณ์มหาวิทยาลัย มอบให้แก่นักศึกษาทุกคณะที่มี GPA ไม่ต่ำกว่า 3.50 เพื่อสนับสนุนความเป็นเลิศทางวิชาการ',
  'Chulalongkorn University''s merit scholarship for students in any faculty maintaining a GPA of 3.50 or above. The scholarship recognizes academic excellence with 20,000 THB annually.',
  now()
);

-- 6. KMUTT Engineering Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนวิศวกรรมศาสตร์ มจธ.',
  'KMUTT Engineering Scholarship',
  'มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าธนบุรี',
  'King Mongkut''s University of Technology Thonburi (KMUTT)',
  'university',
  15000, 'annual', 2.75, 150000,
  array['วิศวกรรมศาสตร์','วิทยาศาสตร์ประยุกต์','เทคโนโลยีสารสนเทศ'], array['national'], false,
  '2025-05-31',
  'https://www.kmutt.ac.th/scholarship',
  array['ใบแสดงผลการเรียน','หนังสือรับรองรายได้ครอบครัว','สำเนาบัตรประชาชน','เรียงความ'],
  'มจธ. มอบทุนการศึกษาสำหรับนักศึกษาสาขาวิศวกรรมศาสตร์และวิทยาศาสตร์ประยุกต์ที่มีความต้องการทางการเงิน ทุนละ 15,000 บาทต่อปี',
  'KMUTT offers scholarships for engineering and applied science students with financial need, providing 15,000 THB per year to help cover tuition and living costs.',
  now()
);

-- 7. CP Foundation Rural Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนมูลนิธิซีพีเพื่อนักเรียนชนบท',
  'CP Foundation Rural Student Scholarship',
  'มูลนิธิเครือเจริญโภคภัณฑ์',
  'CP Foundation',
  'foundation',
  36000, 'annual', 2.50, 120000,
  array['any'], array['สุรินทร์','ร้อยเอ็ด','บุรีรัมย์','ศรีสะเกษ','อุบลราชธานี','นครราชสีมา','ชัยภูมิ','มหาสารคาม','กาฬสินธุ์','เลย','หนองบัวลำภู','อุดรธานี'], true,
  '2025-04-15',
  'https://www.cpfoundation.org/scholarship',
  array['สำเนาทะเบียนบ้าน','หนังสือรับรองรายได้ครอบครัว','ใบแสดงผลการเรียน','บัตรสวัสดิการแห่งรัฐ (ถ้ามี)','รูปถ่าย 1 นิ้ว 2 รูป'],
  'มูลนิธิซีพีมอบทุนให้นักเรียนจากชนบทในภาคตะวันออกเฉียงเหนือที่มีความต้องการทางการเงิน เน้นเยาวชนที่มีความมุ่งมั่นแต่ขาดโอกาส ทุนละ 36,000 บาทต่อปี',
  'The CP Foundation prioritizes rural students from northeastern provinces with financial need. This scholarship of 36,000 THB per year targets motivated youth who lack educational opportunities due to geography and poverty.',
  now()
);

-- 8. Royal Golden Jubilee Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนโครงการปริญญาเอกกาญจนาภิเษก (คปก.)',
  'Royal Golden Jubilee PhD Programme',
  'สำนักงานการวิจัยแห่งชาติ (วช.)',
  'National Research Council of Thailand (NRCT)',
  'royal',
  48000, 'annual', 3.25, null,
  array['วิทยาศาสตร์','วิศวกรรมศาสตร์','เทคโนโลยี','เกษตรศาสตร์','สิ่งแวดล้อม'], array['national'], false,
  '2025-08-31',
  'https://www.nrct.go.th/rgj',
  array['ใบแสดงผลการเรียนระดับปริญญาตรีและโท','จดหมายตอบรับจากอาจารย์ที่ปรึกษา','โครงร่างวิทยานิพนธ์','จดหมายแนะนำ 3 ฉบับ'],
  'โครงการปริญญาเอกกาญจนาภิเษก (คปก.) เป็นทุนระดับปริญญาเอกสำหรับการวิจัยร่วมไทย-ต่างประเทศ เพื่อพัฒนานักวิจัยระดับสูงให้กับประเทศ',
  'The Royal Golden Jubilee PhD Programme (RGJ) supports joint Thai-international doctoral research in science, technology, and agriculture. Students receive 48,000 THB per year plus research travel funds.',
  now()
);

-- 9. KBank Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนการศึกษาธนาคารกสิกรไทย',
  'KBank Education Scholarship',
  'ธนาคารกสิกรไทย',
  'Kasikorn Bank (KBank)',
  'corporate',
  20000, 'annual', 2.75, 180000,
  array['บริหารธุรกิจ','การเงิน','เศรษฐศาสตร์','บัญชี','วิทยาการคอมพิวเตอร์','วิศวกรรมศาสตร์'], array['national'], false,
  '2025-06-15',
  'https://www.kasikornbank.com/scholarship',
  array['ใบแสดงผลการเรียน','หนังสือรับรองรายได้ครอบครัว','สำเนาบัตรประชาชน','เรียงความ (ไม่เกิน 1 หน้า)'],
  'ธนาคารกสิกรไทยมอบทุนการศึกษาสำหรับนักศึกษาสาขาธุรกิจ การเงิน และเทคโนโลยีที่มีความต้องการทางการเงิน พร้อมโอกาสฝึกงานในธนาคาร',
  'KBank offers scholarships for students in business, finance, and technology fields, with financial need. Recipients receive 20,000 THB per year and may be invited for internships at the bank.',
  now()
);

-- 10. Kasetsart University Agriculture Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนส่งเสริมเกษตรกรรมมหาวิทยาลัยเกษตรศาสตร์',
  'Kasetsart University Agricultural Scholarship',
  'มหาวิทยาลัยเกษตรศาสตร์',
  'Kasetsart University',
  'university',
  18000, 'annual', 2.50, 150000,
  array['เกษตรศาสตร์','วนศาสตร์','ประมง','สัตวศาสตร์','เทคโนโลยีการอาหาร'], array['national'], true,
  '2025-05-01',
  'https://www.ku.ac.th/scholarship',
  array['ใบแสดงผลการเรียน','หนังสือรับรองอาชีพเกษตรกรของผู้ปกครอง','หนังสือรับรองรายได้','สำเนาทะเบียนบ้าน'],
  'มหาวิทยาลัยเกษตรศาสตร์มอบทุนสำหรับนักศึกษาสาขาเกษตรและอาหารที่มีความต้องการทางการเงิน โดยให้ความสำคัญแก่บุตรเกษตรกรและผู้ถือบัตรสวัสดิการแห่งรัฐ',
  'Kasetsart University''s scholarship for agricultural and food science students with financial need. Priority is given to children of farming families and welfare card holders, supporting Thailand''s next generation of agricultural professionals.',
  now()
);

-- 11. Chiang Mai University Northern Region Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนนักศึกษาภาคเหนือ มหาวิทยาลัยเชียงใหม่',
  'CMU Northern Region Student Scholarship',
  'มหาวิทยาลัยเชียงใหม่',
  'Chiang Mai University (CMU)',
  'university',
  22000, 'annual', 2.75, 120000,
  array['any'], array['เชียงใหม่','เชียงราย','ลำพูน','ลำปาง','แม่ฮ่องสอน','พะเยา','น่าน','แพร่'], false,
  '2025-06-01',
  'https://www.cmu.ac.th/scholarship',
  array['สำเนาทะเบียนบ้านในจังหวัดภาคเหนือ','ใบแสดงผลการเรียน','หนังสือรับรองรายได้','สำเนาบัตรประชาชน'],
  'มช. มอบทุนสำหรับนักศึกษาจาก 8 จังหวัดภาคเหนือที่มีความต้องการทางการเงิน เพื่อส่งเสริมโอกาสทางการศึกษาในพื้นที่ภาคเหนือ',
  'Chiang Mai University prioritizes students from 8 northern provinces, offering 22,000 THB per year to those with financial need. This scholarship keeps talented northern students close to home for their education.',
  now()
);

-- 12. ThaiBev Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนการศึกษาไทยเบฟเวอเรจ',
  'ThaiBev Scholarship',
  'บริษัท ไทยเบฟเวอเรจ จำกัด (มหาชน)',
  'Thai Beverage Public Company Limited (ThaiBev)',
  'corporate',
  24000, 'annual', 2.75, 200000,
  array['บริหารธุรกิจ','การตลาด','วิศวกรรมศาสตร์','วิทยาศาสตร์การอาหาร','เทคโนโลยี'], array['national'], false,
  '2025-07-15',
  'https://www.thaibev.com/scholarship',
  array['ใบแสดงผลการเรียน','CV หรือประวัติส่วนตัว','เรียงความภาษาไทย','หนังสือรับรองรายได้','จดหมายแนะนำ'],
  'ไทยเบฟเวอเรจมอบทุนการศึกษาสำหรับนักศึกษาในสาขาที่เกี่ยวข้องกับธุรกิจและเทคโนโลยีอาหาร โดยมุ่งพัฒนาบุคลากรที่มีศักยภาพสำหรับอุตสาหกรรมเครื่องดื่ม',
  'ThaiBev scholarships support students in business, marketing, engineering, and food science — fields aligned with the beverage industry. Recipients receive 24,000 THB annually and may be considered for graduate employment.',
  now()
);

-- 13. Toyota Thailand Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนโตโยต้าประเทศไทย',
  'Toyota Thailand Scholarship',
  'บริษัท โตโยต้า มอเตอร์ ประเทศไทย จำกัด',
  'Toyota Motor Thailand Co., Ltd.',
  'corporate',
  30000, 'annual', 2.75, null,
  array['วิศวกรรมยานยนต์','วิศวกรรมเครื่องกล','วิศวกรรมอุตสาหการ','ช่างยนต์','เทคนิคยานยนต์'], array['national'], false,
  '2025-04-30',
  'https://www.toyota.co.th/scholarship',
  array['ใบแสดงผลการเรียน','สำเนาบัตรประชาชน','เรียงความ (ภาษาอังกฤษ)','จดหมายแนะนำจากอาจารย์'],
  'โตโยต้าประเทศไทยมอบทุนสำหรับนักศึกษาสาขาวิศวกรรมยานยนต์และสาขาที่เกี่ยวข้อง เพื่อพัฒนาบุคลากรด้านอุตสาหกรรมยานยนต์ไทย พร้อมโอกาสฝึกงาน',
  'Toyota Thailand supports the development of Thailand''s automotive industry by funding engineering and vocational students. Recipients get 30,000 THB per year plus priority consideration for Toyota internships.',
  now()
);

-- 14. SCG Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนการศึกษา SCG',
  'SCG Scholarship',
  'บริษัท ปูนซิเมนต์ไทย จำกัด (มหาชน)',
  'The Siam Cement Group (SCG)',
  'corporate',
  35000, 'annual', 3.00, null,
  array['วิศวกรรมศาสตร์','สถาปัตยกรรมศาสตร์','วิทยาศาสตร์','ออกแบบอุตสาหกรรม'], array['national'], false,
  '2025-03-31',
  'https://www.scg.com/scholarship',
  array['ใบแสดงผลการเรียน','Portfolio (สำหรับสาขาออกแบบ)','เรียงความ','จดหมายแนะนำ 2 ฉบับ','สำเนาบัตรประชาชน'],
  'SCG มอบทุนสำหรับนักศึกษาสาขาวิศวกรรมและสถาปัตยกรรม เพื่อพัฒนาบุคลากรที่มีความสามารถสูงในอุตสาหกรรมก่อสร้างและวัสดุก่อสร้าง ทุนละ 35,000 บาทต่อปี',
  'SCG''s flagship scholarship for engineering and architecture students aims to build a talent pipeline for Thailand''s construction and materials industry. Recipients receive 35,000 THB annually, with mentoring from senior SCG engineers.',
  now()
);

-- 15. Fulbright Thai Student Scholarship
insert into scholarships (
  name_th, name_en, funder_name_th, funder_name_en, funder_type,
  amount_thb, amount_type, min_gpa, max_income_thb,
  field_of_study, province_restriction, welfare_card_priority,
  deadline_date, application_url, documents_required,
  description_th, description_en, last_verified_at
) values (
  'ทุนฟุลไบรท์สำหรับนักศึกษาไทย',
  'Fulbright Thai Graduate Scholarship Program',
  'มูลนิธิการศึกษาไทย-อเมริกัน (ฟุลไบรท์)',
  'Thai-American Education Foundation (Fulbright)',
  'foundation',
  null, 'annual', 3.25, null,
  array['any'], array['national'], false,
  '2025-05-31',
  'https://www.fulbrightthai.org',
  array['ใบแสดงผลการเรียน (ระดับปริญญาตรี)','TOEFL หรือ IELTS score','Letter of Intent (ภาษาอังกฤษ)','จดหมายแนะนำ 3 ฉบับ','CV/Resume (ภาษาอังกฤษ)'],
  'ทุนฟุลไบรท์เป็นทุนระดับปริญญาโท-เอก ณ สหรัฐอเมริกา สำหรับนักศึกษาไทยที่มีผลการเรียนดีและทักษะภาษาอังกฤษสูง ครอบคลุมค่าเล่าเรียน ค่าครองชีพ และค่าเดินทาง',
  'The Fulbright Thai Graduate Scholarship Program funds Thai students for master''s or doctoral study at U.S. universities. It covers full tuition, living expenses, and travel — one of Thailand''s most prestigious international scholarships. Strong English skills required.',
  now()
);
