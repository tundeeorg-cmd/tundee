'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useUserProfile } from '@/contexts/UserContext';
import { createClient } from '@/lib/supabase/client';
import { uploadAvatar, getInitials } from '@/lib/profile';
import Toast from '@/components/Toast';
import type { User } from '@supabase/supabase-js';

// ── Province list ─────────────────────────────────────────────────────────
const PROVINCES = [
  { id: 'TH-10', th: 'กรุงเทพมหานคร', en: 'Bangkok' },
  { id: 'TH-11', th: 'สมุทรปราการ', en: 'Samut Prakan' },
  { id: 'TH-12', th: 'นนทบุรี', en: 'Nonthaburi' },
  { id: 'TH-13', th: 'ปทุมธานี', en: 'Pathum Thani' },
  { id: 'TH-14', th: 'พระนครศรีอยุธยา', en: 'Ayutthaya' },
  { id: 'TH-15', th: 'อ่างทอง', en: 'Ang Thong' },
  { id: 'TH-16', th: 'ลพบุรี', en: 'Lop Buri' },
  { id: 'TH-17', th: 'สิงห์บุรี', en: 'Sing Buri' },
  { id: 'TH-18', th: 'ชัยนาท', en: 'Chai Nat' },
  { id: 'TH-19', th: 'สระบุรี', en: 'Saraburi' },
  { id: 'TH-20', th: 'ชลบุรี', en: 'Chon Buri' },
  { id: 'TH-21', th: 'ระยอง', en: 'Rayong' },
  { id: 'TH-22', th: 'จันทบุรี', en: 'Chanthaburi' },
  { id: 'TH-23', th: 'ตราด', en: 'Trat' },
  { id: 'TH-24', th: 'ฉะเชิงเทรา', en: 'Chachoengsao' },
  { id: 'TH-25', th: 'ปราจีนบุรี', en: 'Prachin Buri' },
  { id: 'TH-26', th: 'นครนายก', en: 'Nakhon Nayok' },
  { id: 'TH-27', th: 'สระแก้ว', en: 'Sa Kaeo' },
  { id: 'TH-30', th: 'นครราชสีมา', en: 'Nakhon Ratchasima' },
  { id: 'TH-31', th: 'บุรีรัมย์', en: 'Buri Ram' },
  { id: 'TH-32', th: 'สุรินทร์', en: 'Surin' },
  { id: 'TH-33', th: 'ศรีสะเกษ', en: 'Si Sa Ket' },
  { id: 'TH-34', th: 'อุบลราชธานี', en: 'Ubon Ratchathani' },
  { id: 'TH-35', th: 'ยโสธร', en: 'Yasothon' },
  { id: 'TH-36', th: 'ชัยภูมิ', en: 'Chaiyaphum' },
  { id: 'TH-37', th: 'อำนาจเจริญ', en: 'Amnat Charoen' },
  { id: 'TH-38', th: 'บึงกาฬ', en: 'Bueng Kan' },
  { id: 'TH-39', th: 'หนองบัวลำภู', en: 'Nong Bua Lam Phu' },
  { id: 'TH-40', th: 'ขอนแก่น', en: 'Khon Kaen' },
  { id: 'TH-41', th: 'อุดรธานี', en: 'Udon Thani' },
  { id: 'TH-42', th: 'เลย', en: 'Loei' },
  { id: 'TH-43', th: 'หนองคาย', en: 'Nong Khai' },
  { id: 'TH-44', th: 'มหาสารคาม', en: 'Maha Sarakham' },
  { id: 'TH-45', th: 'ร้อยเอ็ด', en: 'Roi Et' },
  { id: 'TH-46', th: 'กาฬสินธุ์', en: 'Kalasin' },
  { id: 'TH-47', th: 'สกลนคร', en: 'Sakon Nakhon' },
  { id: 'TH-48', th: 'นครพนม', en: 'Nakhon Phanom' },
  { id: 'TH-49', th: 'มุกดาหาร', en: 'Mukdahan' },
  { id: 'TH-50', th: 'เชียงใหม่', en: 'Chiang Mai' },
  { id: 'TH-51', th: 'ลำพูน', en: 'Lamphun' },
  { id: 'TH-52', th: 'ลำปาง', en: 'Lampang' },
  { id: 'TH-53', th: 'อุตรดิตถ์', en: 'Uttaradit' },
  { id: 'TH-54', th: 'แพร่', en: 'Phrae' },
  { id: 'TH-55', th: 'น่าน', en: 'Nan' },
  { id: 'TH-56', th: 'พะเยา', en: 'Phayao' },
  { id: 'TH-57', th: 'เชียงราย', en: 'Chiang Rai' },
  { id: 'TH-58', th: 'แม่ฮ่องสอน', en: 'Mae Hong Son' },
  { id: 'TH-60', th: 'นครสวรรค์', en: 'Nakhon Sawan' },
  { id: 'TH-61', th: 'อุทัยธานี', en: 'Uthai Thani' },
  { id: 'TH-62', th: 'กำแพงเพชร', en: 'Kamphaeng Phet' },
  { id: 'TH-63', th: 'ตาก', en: 'Tak' },
  { id: 'TH-64', th: 'สุโขทัย', en: 'Sukhothai' },
  { id: 'TH-65', th: 'พิษณุโลก', en: 'Phitsanulok' },
  { id: 'TH-66', th: 'พิจิตร', en: 'Phichit' },
  { id: 'TH-67', th: 'เพชรบูรณ์', en: 'Phetchabun' },
  { id: 'TH-70', th: 'ราชบุรี', en: 'Ratchaburi' },
  { id: 'TH-71', th: 'กาญจนบุรี', en: 'Kanchanaburi' },
  { id: 'TH-72', th: 'สุพรรณบุรี', en: 'Suphan Buri' },
  { id: 'TH-73', th: 'นครปฐม', en: 'Nakhon Pathom' },
  { id: 'TH-74', th: 'สมุทรสาคร', en: 'Samut Sakhon' },
  { id: 'TH-75', th: 'สมุทรสงคราม', en: 'Samut Songkhram' },
  { id: 'TH-76', th: 'เพชรบุรี', en: 'Phetchaburi' },
  { id: 'TH-77', th: 'ประจวบคีรีขันธ์', en: 'Prachuap Khiri Khan' },
  { id: 'TH-80', th: 'นครศรีธรรมราช', en: 'Nakhon Si Thammarat' },
  { id: 'TH-81', th: 'กระบี่', en: 'Krabi' },
  { id: 'TH-82', th: 'พังงา', en: 'Phangnga' },
  { id: 'TH-83', th: 'ภูเก็ต', en: 'Phuket' },
  { id: 'TH-84', th: 'สุราษฎร์ธานี', en: 'Surat Thani' },
  { id: 'TH-85', th: 'ระนอง', en: 'Ranong' },
  { id: 'TH-86', th: 'ชุมพร', en: 'Chumphon' },
  { id: 'TH-90', th: 'สงขลา', en: 'Songkhla' },
  { id: 'TH-91', th: 'สตูล', en: 'Satun' },
  { id: 'TH-92', th: 'ตรัง', en: 'Trang' },
  { id: 'TH-93', th: 'พัทลุง', en: 'Phatthalung' },
  { id: 'TH-94', th: 'ปัตตานี', en: 'Pattani' },
  { id: 'TH-95', th: 'ยะลา', en: 'Yala' },
  { id: 'TH-96', th: 'นราธิวาส', en: 'Narathiwat' },
];

// ── Fields of interest ────────────────────────────────────────────────────
const FIELDS = [
  { id: 'any',              th: 'ทุกสาขา',                en: 'Any Field' },
  { id: 'engineering',      th: 'วิศวกรรมศาสตร์',        en: 'Engineering' },
  { id: 'medicine',         th: 'แพทยศาสตร์',            en: 'Medicine' },
  { id: 'science',          th: 'วิทยาศาสตร์',           en: 'Science' },
  { id: 'business',         th: 'บริหารธุรกิจ',          en: 'Business' },
  { id: 'computer_science', th: 'วิทยาการคอมพิวเตอร์',   en: 'Computer Science' },
  { id: 'data_science',     th: 'วิทยาศาสตร์ข้อมูล',    en: 'Data Science' },
  { id: 'agriculture',      th: 'เกษตรศาสตร์',           en: 'Agriculture' },
  { id: 'education',        th: 'ศึกษาศาสตร์',           en: 'Education' },
  { id: 'law',              th: 'นิติศาสตร์',            en: 'Law' },
  { id: 'arts',             th: 'ศิลปะ',                 en: 'Arts' },
];

const GRADE_LEVELS = ['M4', 'M5', 'M6', 'uni', 'graduate'] as const;
type GradeLevel = typeof GRADE_LEVELS[number];

const GRADE_LABELS: Record<GradeLevel, { th: string; en: string }> = {
  M4: { th: 'ม.4', en: 'M4 (Gr.10)' },
  M5: { th: 'ม.5', en: 'M5 (Gr.11)' },
  M6: { th: 'ม.6', en: 'M6 (Gr.12)' },
  uni: { th: 'ป.ตรี', en: 'Bachelor' },
  graduate: { th: 'ป.โท/เอก', en: 'Graduate' },
};

// ── Section label ──────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#AEAEB2] dark:text-[#636366] mb-3">
      {children}
    </p>
  );
}

// ── Card wrapper ───────────────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#161B27] border border-[#E5E5EA] dark:border-[#232B3E] rounded-2xl p-6 space-y-4">
      {children}
    </div>
  );
}

// ── Save button ────────────────────────────────────────────────────────────
function SaveButton({ saving, lang, onClick }: { saving: boolean; lang: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="flex items-center justify-center gap-2 bg-[#2E6BE6] hover:bg-[#1E57CC] active:scale-[0.98] text-white font-semibold px-6 py-3 rounded-xl transition-all disabled:opacity-50 text-sm w-full sm:w-auto"
    >
      {saving && (
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      )}
      {saving ? (lang === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (lang === 'th' ? 'บันทึก' : 'Save')}
    </button>
  );
}

// ── Toggle switch ──────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#2E6BE6] focus:ring-offset-2 dark:focus:ring-offset-[#1C1C1E] ${
        checked ? 'bg-[#2E6BE6]' : 'bg-[#E5E5EA] dark:bg-[#38383A]'
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-[22px] h-[22px] bg-white rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const { setAvatarUrl: setNavAvatar, setDisplayName: setNavDisplayName } = useUserProfile();
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Personal info
  const [savedDisplayName, setSavedDisplayName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);

  // Student profile
  const [gpa, setGpa] = useState('');
  const [province, setProvince] = useState('');
  const [provinceSearch, setProvinceSearch] = useState('');
  const [incomeBracket, setIncomeBracket] = useState<number>(4);
  const [welfareCard, setWelfareCard] = useState(false);
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('M6');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [schoolType, setSchoolType] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setToast(null), 350);
    }, 2500);
  }

  // ── Auth use onAuthStateChange for reliability ─────────────────────────
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name ?? '');
        setSavedDisplayName(data.display_name ?? '');
        setAvatarUrl(data.avatar_url ?? null);
        setGpa(data.gpa != null ? String(data.gpa) : '');
        setProvince(data.province_id ?? '');
        setIncomeBracket(data.income_bracket ?? 4);
        setWelfareCard(data.welfare_card ?? false);
        setGradeLevel((data.grade_level as GradeLevel) ?? 'M6');
        setSelectedFields(
          data.fields_of_interest?.filter((f: string) => f !== 'any') ?? []
        );
        setSchoolType(data.school_type ?? '');
      }
    } catch { /* row may not exist yet */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;

    // Immediate session check
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        setUser(data.session.user);
        loadProfile(data.session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        // Also listen for INITIAL_SESSION from onAuthStateChange
      }
    });

    // Auth state listener authoritative source
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        if (session?.user) {
          setUser(session.user);
          loadProfile(session.user.id).finally(() => {
            if (mounted) setLoading(false);
          });
        } else if (event === 'SIGNED_OUT') {
          router.replace('/auth');
        } else if (event === 'INITIAL_SESSION' && !session) {
          setLoading(false);
        }
      }
    );

    // Hard timeout never stuck on spinner
    const t = setTimeout(() => { if (mounted) setLoading(false); }, 4000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(t);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast(lang === 'th' ? 'ไฟล์ใหญ่เกินไป (max 5 MB)' : 'File too large (max 5 MB)', 'error');
      return;
    }
    setAvatarUploading(true);
    try {
      const url = await uploadAvatar(user.id, file);
      setAvatarUrl(url);
      setNavAvatar(url);
      showToast(lang === 'th' ? 'อัปโหลดสำเร็จ ✓' : 'Photo updated ✓', 'success');
    } catch {
      showToast(lang === 'th' ? 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่' : 'Upload failed. Please try again.', 'error');
    }
    setAvatarUploading(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSaveName() {
    if (!user) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, display_name: displayName.trim(), updated_at: new Date().toISOString() });
      if (error) throw error;
      setSavedDisplayName(displayName.trim());
      setNavDisplayName(displayName.trim());
      showToast(lang === 'th' ? 'บันทึกเรียบร้อย ✓' : 'Saved ✓', 'success');
    } catch {
      showToast(lang === 'th' ? 'บันทึกไม่สำเร็จ กรุณาลองใหม่' : 'Save failed. Please try again.', 'error');
    }
    setSavingName(false);
  }

  async function handleSaveProfile() {
    if (!user) return;
    setSavingProfile(true);
    try {
      const gpaNum = parseFloat(gpa);
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        gpa: !isNaN(gpaNum) && gpaNum >= 0 && gpaNum <= 4 ? gpaNum : null,
        province_id: province || null,
        income_bracket: incomeBracket,
        welfare_card: welfareCard,
        grade_level: gradeLevel,
        fields_of_interest: selectedFields.length > 0 ? selectedFields : ['any'],
        school_type: schoolType || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      showToast(lang === 'th' ? 'บันทึกโปรไฟล์เรียบร้อย ✓' : 'Profile saved ✓', 'success');
    } catch {
      showToast(lang === 'th' ? 'บันทึกไม่สำเร็จ กรุณาลองใหม่' : 'Save failed. Please try again.', 'error');
    }
    setSavingProfile(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  function toggleField(id: string) {
    setSelectedFields(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-[#2E6BE6] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]">
            {lang === 'th' ? 'กำลังโหลด...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  // ── Not logged in → redirect (should rarely show) ──────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-[#6E6E73] dark:text-[#8E8E93] mb-4 text-sm">
            {lang === 'th' ? 'กำลังพาไปหน้าเข้าสู่ระบบ...' : 'Redirecting to login...'}
          </p>
          <Link href="/auth" className="text-[#2E6BE6] font-semibold text-sm hover:underline">
            {lang === 'th' ? 'คลิกที่นี่หากไม่ redirect' : 'Click here if not redirected'}
          </Link>
        </div>
      </div>
    );
  }

  // ── Province filtered list ─────────────────────────────────────────────
  const filteredProvinces = provinceSearch.trim()
    ? PROVINCES.filter(p =>
        p.th.includes(provinceSearch) ||
        p.en.toLowerCase().includes(provinceSearch.toLowerCase())
      )
    : PROVINCES;

  const initials = getInitials(displayName || user.email || '?');

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111]">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#161B27] border-b border-[#E5E5EA] dark:border-[#232B3E]">
        <div className="max-w-[560px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/scholarships"
            className="flex items-center gap-1.5 text-sm text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
            {lang === 'th' ? 'กลับ' : 'Back'}
          </Link>
          <h1 className="text-base font-semibold text-[#1D1D1F] dark:text-white">
            {lang === 'th' ? 'โปรไฟล์ของฉัน' : 'My Profile'}
          </h1>
          <div className="w-12" /> {/* spacer */}
        </div>
      </div>

      <div className="max-w-[560px] mx-auto px-4 py-8 space-y-5 pb-20">

        {/* ── SECTION 1: Avatar ─────────────────────────────────────── */}
        <div className="flex flex-col items-center pt-4 pb-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="block w-24 h-24 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#2E6BE6] focus:ring-offset-2 dark:focus:ring-offset-[#111111]"
              aria-label={lang === 'th' ? 'เปลี่ยนรูปโปรไฟล์' : 'Change profile photo'}
            >
              {avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full bg-[#2E6BE6] text-white flex items-center justify-center text-3xl font-bold select-none">
                  {initials}
                </span>
              )}
              {/* Upload overlay */}
              {avatarUploading && (
                <span className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                  <svg className="animate-spin w-6 h-6 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 text-sm font-medium text-[#2E6BE6] hover:text-[#1E57CC] transition-colors flex items-center gap-1.5"
          >
            <span>📷</span>
            {lang === 'th' ? 'เปลี่ยนรูปภาพ' : 'Change photo'}
          </button>
          <p className="text-xs text-[#AEAEB2] mt-1">JPG, PNG, WebP · max 5 MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {/* ── SECTION 2: Personal info ──────────────────────────────── */}
        <div>
          <SectionLabel>{lang === 'th' ? 'ข้อมูลส่วนตัว' : 'Personal Info'}</SectionLabel>
          <Card>
            {/* Display name */}
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
                {lang === 'th' ? 'ชื่อที่แสดง' : 'Display Name'}
              </label>
              <input
                type="text"
                maxLength={50}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder={lang === 'th' ? 'ชื่อของคุณ' : 'Your name'}
                className="w-full px-[14px] py-3 rounded-[10px] border border-[#E5E5EA] dark:border-[#232B3E] bg-white dark:bg-[#232B3E] text-[15px] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:border-[#2E6BE6] focus:ring-1 focus:ring-[#2E6BE6] transition-colors placeholder:text-[#AEAEB2]"
              />
              <p className="text-xs text-[#AEAEB2] mt-1 text-right">{displayName.length}/50</p>
            </div>

            {/* Email (readonly) */}
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
                {lang === 'th' ? 'อีเมล' : 'Email'}
              </label>
              <input
                type="email"
                readOnly
                value={user.email ?? ''}
                className="w-full px-[14px] py-3 rounded-[10px] border border-[#E5E5EA] dark:border-[#232B3E] bg-[#F7F9FC] dark:bg-[#3A3A3C] text-[15px] text-[#AEAEB2] cursor-not-allowed"
              />
              <p className="text-xs text-[#AEAEB2] mt-1">
                {lang === 'th' ? 'ไม่สามารถเปลี่ยนอีเมลได้' : 'Email cannot be changed'}
              </p>
            </div>

            <div className="flex justify-end">
              <SaveButton
                saving={savingName}
                lang={lang}
                onClick={handleSaveName}
              />
            </div>
          </Card>
        </div>

        {/* ── SECTION 3: Student profile ────────────────────────────── */}
        <div>
          <SectionLabel>{lang === 'th' ? 'โปรไฟล์นักเรียน' : 'Student Profile'}</SectionLabel>
          <Card>
            {/* Info note */}
            <p className="text-xs text-[#AEAEB2] dark:text-[#636366] flex items-center gap-1.5 -mt-1">
              <span>🎯</span>
              {lang === 'th'
                ? 'ข้อมูลนี้ใช้สำหรับจับคู่ทุนที่เหมาะกับคุณ'
                : 'Used to match scholarships to your profile'}
            </p>

            {/* Grade level */}
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">
                {lang === 'th' ? 'ระดับการศึกษา' : 'Grade Level'}
              </label>
              <div className="flex flex-wrap gap-2">
                {GRADE_LEVELS.map(gl => (
                  <button
                    key={gl}
                    type="button"
                    onClick={() => setGradeLevel(gl)}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-all ${
                      gradeLevel === gl
                        ? 'bg-[#2E6BE6] text-white border-[#2E6BE6] font-semibold'
                        : 'border-[#E5E5EA] dark:border-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6]/60'
                    }`}
                  >
                    {GRADE_LABELS[gl][lang as 'th' | 'en']}
                  </button>
                ))}
              </div>
            </div>

            {/* GPA */}
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
                {lang === 'th' ? 'เกรดเฉลี่ย (GPAX)' : 'GPA (GPAX)'}
              </label>
              <input
                type="number"
                min="0"
                max="4"
                step="0.01"
                value={gpa}
                onChange={e => setGpa(e.target.value)}
                placeholder="0.00 – 4.00"
                className={`w-full px-[14px] py-3 rounded-[10px] border bg-white dark:bg-[#232B3E] text-[15px] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:border-[#2E6BE6] focus:ring-1 focus:ring-[#2E6BE6] transition-colors placeholder:text-[#AEAEB2] ${
                  gpa && (parseFloat(gpa) < 0 || parseFloat(gpa) > 4)
                    ? 'border-red-400'
                    : 'border-[#E5E5EA] dark:border-[#232B3E]'
                }`}
              />
              {gpa && (parseFloat(gpa) < 0 || parseFloat(gpa) > 4) && (
                <p className="text-xs text-red-500 mt-1">
                  {lang === 'th' ? 'กรุณากรอก 0.00 – 4.00' : 'Must be between 0.00 and 4.00'}
                </p>
              )}
            </div>

            {/* Province */}
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
                {lang === 'th' ? 'จังหวัด' : 'Province'}
              </label>
              <input
                type="text"
                value={provinceSearch}
                onChange={e => setProvinceSearch(e.target.value)}
                placeholder={lang === 'th' ? 'ค้นหาจังหวัด...' : 'Search province...'}
                className="w-full px-[14px] py-2.5 rounded-[10px] border border-[#E5E5EA] dark:border-[#232B3E] bg-white dark:bg-[#232B3E] text-sm text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:border-[#2E6BE6] transition-colors placeholder:text-[#AEAEB2] mb-2"
              />
              <select
                value={province}
                onChange={e => { setProvince(e.target.value); setProvinceSearch(''); }}
                className="w-full px-[14px] py-3 rounded-[10px] border border-[#E5E5EA] dark:border-[#232B3E] bg-white dark:bg-[#232B3E] text-[15px] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:border-[#2E6BE6] focus:ring-1 focus:ring-[#2E6BE6] transition-colors"
              >
                <option value="">{lang === 'th' ? 'เลือกจังหวัด' : 'Select province'}</option>
                {filteredProvinces.map(p => (
                  <option key={p.id} value={p.id}>
                    {lang === 'th' ? p.th : p.en}
                  </option>
                ))}
              </select>
            </div>

            {/* Income bracket */}
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
                {lang === 'th' ? 'รายได้ครัวเรือน / เดือน' : 'Monthly Household Income'}
              </label>
              <select
                value={incomeBracket}
                onChange={e => setIncomeBracket(Number(e.target.value))}
                className="w-full px-[14px] py-3 rounded-[10px] border border-[#E5E5EA] dark:border-[#232B3E] bg-white dark:bg-[#232B3E] text-[15px] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:border-[#2E6BE6] focus:ring-1 focus:ring-[#2E6BE6] transition-colors"
              >
                {([
                  [1, { th: 'น้อยกว่า 5,000 บาท', en: 'Under 5,000 THB' }],
                  [2, { th: '5,000 – 10,000 บาท', en: '5,000 – 10,000 THB' }],
                  [3, { th: '10,000 – 15,000 บาท', en: '10,000 – 15,000 THB' }],
                  [4, { th: '15,000 – 20,000 บาท', en: '15,000 – 20,000 THB' }],
                  [5, { th: '20,000 – 30,000 บาท', en: '20,000 – 30,000 THB' }],
                  [6, { th: '30,000 – 50,000 บาท', en: '30,000 – 50,000 THB' }],
                  [7, { th: 'มากกว่า 50,000 บาท', en: 'Over 50,000 THB' }],
                ] as [number, { th: string; en: string }][]).map(([val, labels]) => (
                  <option key={val} value={val}>{labels[lang as 'th' | 'en']}</option>
                ))}
              </select>
            </div>

            {/* Fields of interest */}
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">
                {lang === 'th' ? 'สาขาที่สนใจ' : 'Fields of Interest'}
              </label>
              <div className="flex flex-wrap gap-2">
                {FIELDS.map(f => {
                  const active = selectedFields.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleField(f.id)}
                      className={`text-sm px-3 py-1.5 rounded-full border transition-all ${
                        active
                          ? 'bg-[#2E6BE6] text-white border-[#2E6BE6] font-medium'
                          : 'border-[#E5E5EA] dark:border-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6]/60'
                      }`}
                    >
                      {f[lang as 'th' | 'en']}
                    </button>
                  );
                })}
              </div>
              {selectedFields.length === 0 && (
                <p className="text-xs text-[#AEAEB2] mt-2 italic">
                  {lang === 'th' ? '  ไม่ได้เลือก จะแสดงทุนทุกสาขา  ' : '  None selected shows all fields  '}
                </p>
              )}
            </div>

            {/* School type */}
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">
                {lang === 'th' ? 'ประเภทโรงเรียน' : 'School Type'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'government',    th: 'รัฐบาล',        en: 'Government'    },
                  { value: 'private',       th: 'เอกชน',         en: 'Private'       },
                  { value: 'international', th: 'นานาชาติ',      en: 'International' },
                  { value: 'vocational',    th: 'อาชีวศึกษา',    en: 'Vocational'    },
                ] as { value: string; th: string; en: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSchoolType(schoolType === opt.value ? '' : opt.value)}
                    className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      schoolType === opt.value
                        ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552] text-[#1E57CC] dark:text-[#5B8EF0]'
                        : 'border-[#E5E5EA] dark:border-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6]/50'
                    }`}
                  >
                    {lang === 'th' ? opt.th : opt.en}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#AEAEB2] dark:text-[#636366] mt-2 flex items-center gap-1">
                <span>🔬</span>
                {lang === 'th'
                  ? 'ข้อมูลนี้ใช้เพื่องานวิจัยการศึกษา ไม่กระทบการแสดงทุน'
                  : 'Used for educational research only, doesn\'t affect matching'}
              </p>
            </div>

            {/* Welfare card toggle */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                  {lang === 'th' ? 'บัตรสวัสดิการแห่งรัฐ' : 'State Welfare Card'}
                </p>
                <p className="text-xs text-[#AEAEB2] mt-0.5">
                  {lang === 'th' ? 'เปิดหากคุณมีบัตรสวัสดิการแห่งรัฐ' : 'Enable if you hold a state welfare card'}
                </p>
              </div>
              <Toggle checked={welfareCard} onChange={setWelfareCard} />
            </div>

            <div className="flex justify-end pt-1">
              <SaveButton saving={savingProfile} lang={lang} onClick={handleSaveProfile} />
            </div>
          </Card>
        </div>

        {/* ── SECTION 4: Settings ───────────────────────────────────── */}
        <div>
          <SectionLabel>{lang === 'th' ? 'การตั้งค่า' : 'Settings'}</SectionLabel>
          <Card>
            {/* Theme */}
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">
                {lang === 'th' ? 'ธีม' : 'Theme'}
              </label>
              <div className="flex gap-2">
                {([
                  { key: 'light' as const, icon: '☀️', th: 'สว่าง',    en: 'Light' },
                  { key: 'dark'  as const, icon: '🌙', th: 'มืด',      en: 'Dark'  },
                  { key: 'auto'  as const, icon: '⚙️', th: 'อัตโนมัติ', en: 'Auto'  },
                ]).map(({ key, icon, th: thLabel, en: enLabel }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTheme(key)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all text-sm ${
                      theme === key
                        ? 'bg-[#EFF4FF] dark:bg-[#162552] border-[#2E6BE6] text-[#1E57CC] dark:text-[#5B8EF0] font-semibold'
                        : 'border-[#E5E5EA] dark:border-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6]/50'
                    }`}
                  >
                    <span className="text-lg leading-none">{icon}</span>
                    <span>{lang === 'th' ? thLabel : enLabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">
                {lang === 'th' ? 'ภาษา' : 'Language'}
              </label>
              <div className="flex gap-2">
                {([
                  { key: 'th' as const, label: '🇹🇭  ภาษาไทย' },
                  { key: 'en' as const, label: '🇬🇧  English' },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLang(key)}
                    className={`flex-1 py-3 rounded-xl border transition-all text-sm font-medium ${
                      lang === key
                        ? 'bg-[#EFF4FF] dark:bg-[#162552] border-[#2E6BE6] text-[#1E57CC] dark:text-[#5B8EF0] font-semibold'
                        : 'border-[#E5E5EA] dark:border-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6]/50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* ── SECTION 5: Sign out ───────────────────────────────────── */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full py-3.5 rounded-xl border-2 border-red-400 dark:border-red-500 text-red-500 dark:text-red-400 font-semibold text-sm hover:bg-red-50 dark:hover:bg-red-950 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span>🚪</span>
            {lang === 'th' ? 'ออกจากระบบ' : 'Sign Out'}
          </button>
          <p className="text-center text-xs text-[#AEAEB2] mt-4">
            TunDee · ทุนดี · tundee.org
          </p>
        </div>

      </div>

      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.type} visible={toastVisible} />}
    </div>
  );
}
