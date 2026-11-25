import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Upload,
  Trash2,
  Store,
  ShieldCheck,
} from 'lucide-react';

// Ganti import dari sellerService:
import {
  fetchPendingRegistration,
  preloadGoogleGsiScript,
  openGoogleCodePopup,
  exchangeGoogleAuthCode,
  registerSellerShop,
} from '../utils/sellerService';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (selaras dengan storage/config.py)

export default function SellerRegisterView({ onRegisterSuccess, onBackToCatalog }) {
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingEmail, setPendingEmail] = useState('');
  const [sessionInvalidMsg, setSessionInvalidMsg] = useState('');

  const [form, setForm] = useState({
    name: '',
    number: '',
    address: '',
    instagram: '',
    online_shop: '',
    gmaps: '',
    description: '',
  });

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef(null);

  // Verifikasi sesi pending_oauth dari cookie registration_token saat halaman /register dibuka
  useEffect(() => {
    let active = true;

    async function verifyPendingSession() {
      try {
        const data = await fetchPendingRegistration();
        if (!active) return;
        if (data?.email) {
          setPendingEmail(data.email);
        } else {
          setSessionInvalidMsg(
            'Sesi pendaftaran tidak ditemukan. Silakan masuk terlebih dahulu menggunakan Google.'
          );
        }
      } catch (err) {
        if (!active) return;
        setSessionInvalidMsg(
          err?.message ||
            'Sesi pendaftaran habis atau belum login Google. Silakan masuk ulang melalui Google.'
        );
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    verifyPendingSession();
    return () => {
      active = false;
    };
  }, []);

  // Bersihkan Object URL preview agar tidak bocor memori
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  const handleFieldChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleLogoSelect = (e) => {
    setErrorMsg('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
      setErrorMsg('Format logo harus berupa JPG, PNG, atau WebP.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setErrorMsg('Ukuran file logo maksimal 5 MB.');
      e.target.value = '';
      return;
    }

    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }

    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveLogo = () => {
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    setLogoFile(null);
    setLogoPreviewUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = form.name.trim();
    if (trimmedName.length < 2) {
      setErrorMsg('Nama sanggar / toko UMKM wajib diisi minimal 2 karakter.');
      return;
    }

    setIsSubmitting(true);
    try {
      await registerSellerShop(form, logoFile);
      onRegisterSuccess();
    } catch (err) {
      if (err?.status === 401) {
        setSessionInvalidMsg(
          err.message || 'Sesi pendaftaran telah habis. Silakan masuk ulang via Google.'
        );
      } else {
        setErrorMsg(err?.message || 'Gagal mendaftarkan sanggar. Silakan coba lagi.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestartGoogleLogin = () => {
    setErrorMsg('');
    openGoogleCodePopup({
      onCode: async (code) => {
        try {
          const result = await exchangeGoogleAuthCode(code);
          if (result.status === 'need_registration' && result.data?.email) {
            setPendingEmail(result.data.email);
            setSessionInvalidMsg('');
            return;
          }
          onRegisterSuccess();
        } catch (err) {
          setSessionInvalidMsg(
            err?.message || 'Gagal memulai ulang sesi Google. Silakan coba lagi.'
          );
        }
      },
      onError: (msg) => setSessionInvalidMsg(msg),
      onCancel: () => {},
    });
  };

  return (
    <div className="min-h-screen bg-[#F7F4EE] text-[#1C1917] flex flex-col justify-between">
      {/* Header */}
      <header className="bg-[#F7F4EE] border-b border-[#1C1917]/12">
        <div className="taste-wrap h-[72px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg
              width="24"
              height="24"
              viewBox="0 0 32 32"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <path d="M16 4L28 16L16 28L4 16L16 4Z" stroke="#7C3219" strokeWidth="2" />
              <circle cx="16" cy="16" r="3.5" fill="#7C3219" />
            </svg>
            <div>
              <span className="font-aksara text-[20px] sm:text-[22px] block leading-none text-[#1C1917]">
                Batik Wicara Trenggalek
              </span>
              <span className="text-[13px] text-[#575049] block mt-1">
                Pendaftaran Sanggar UMKM Baru
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToCatalog}
            className="taste-btn-secondary"
          >
            <ArrowLeft className="w-4 h-4 text-[#7C3219]" />
            <span>Kembali ke Etalase</span>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="taste-wrap w-full py-10 lg:py-14">
        {checkingSession ? (
          <div className="max-w-lg mx-auto rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-10 text-center space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#7C3219] mx-auto" />
            <p className="font-serif text-lg text-[#1C1917]">
              Memverifikasi sesi Google Anda...
            </p>
          </div>
        ) : sessionInvalidMsg ? (
          <div className="max-w-lg mx-auto rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-8 text-center space-y-5">
            <div className="w-12 h-12 rounded-full bg-[#9E2A2B]/10 text-[#9E2A2B] flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h1 className="font-serif font-normal text-2xl text-[#1C1917]">
                Sesi Pendaftaran Tidak Tersedia
              </h1>
              <p className="text-[14px] text-[#575049] leading-relaxed">
                {sessionInvalidMsg}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
              <button
                type="button"
                onClick={handleRestartGoogleLogin}
                className="taste-btn-primary"
              >
                <span>Masuk Ulang dengan Google</span>
              </button>
              <button
                type="button"
                onClick={onBackToCatalog}
                className="taste-btn-secondary"
              >
                <span>Kembali ke Etalase</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Kolom Kiri: Info Akun Google & Upload Logo UMKM */}
            <div className="lg:col-span-4 space-y-5 hero-enter-title">
              <div className="rounded-lg bg-[#1B1714] text-[#F5F1E8] p-6 space-y-4">
                <div className="inline-flex items-center gap-2 text-[#C4A46B] text-[13px] font-medium">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Email Google terverifikasi</span>
                </div>
                <h1 className="font-serif font-normal text-2xl leading-snug">
                  Lengkapi Identitas Sanggar Anda
                </h1>
                <div className="rounded-md bg-white/8 border border-white/15 px-3.5 py-2.5 flex items-center gap-2.5 text-[13px]">
                  <Mail className="w-4 h-4 text-[#C4A46B] shrink-0" />
                  <span className="truncate text-[#F5F1E8]">{pendingEmail}</span>
                </div>
                <p className="text-[13px] text-[#B5ACA2] leading-relaxed">
                  Setelah pendaftaran selesai, email ini akan langsung masuk ke dasbor sanggar
                  setiap kali Anda login dengan Google.
                </p>
              </div>

              {/* Kartu Upload Logo UMKM */}
              <div className="rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-6 space-y-4">
                <div>
                  <h2 className="font-serif text-lg font-medium text-[#1C1917]">
                    Logo UMKM (Opsional)
                  </h2>
                  <p className="text-[13px] text-[#575049] mt-1">
                    Unggah logo atau foto profil resmi sanggar Anda. Format JPG, PNG, atau WebP
                    (maks. 5 MB).
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-lg border border-[#1C1917]/15 bg-[#EFEAE0] overflow-hidden flex items-center justify-center shrink-0">
                    {logoPreviewUrl ? (
                      <img
                        src={logoPreviewUrl}
                        alt="Pratinjau logo sanggar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Store className="w-7 h-7 text-[#7C3219]/70" />
                    )}
                  </div>

                  <div className="space-y-2 min-w-0 flex-1">
                    <input
                      ref={fileInputRef}
                      id="shop-logo-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleLogoSelect}
                      className="sr-only"
                    />
                    <div className="flex flex-wrap gap-2">
                      <label
                        htmlFor="shop-logo-upload"
                        className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-md bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/20 text-[13px] font-medium text-[#1C1917] cursor-pointer transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#7C3219]" />
                        <span>{logoFile ? 'Ganti Logo' : 'Pilih Gambar'}</span>
                      </label>

                      {logoFile && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-md bg-[#FCFBF8] hover:bg-[#9E2A2B]/10 border border-[#9E2A2B]/30 text-[13px] font-medium text-[#9E2A2B] cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      )}
                    </div>

                    {logoFile && (
                      <p className="text-[12px] text-[#575049] truncate">
                        {logoFile.name} ({(logoFile.size / 1024).toFixed(0)} KB)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Kolom Kanan: Form Detail Sanggar */}
            <form
              onSubmit={handleSubmit}
              className="lg:col-span-8 rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-6 sm:p-8 space-y-5 hero-enter-step-1"
            >
              <div>
                <h2 className="font-serif font-normal text-2xl text-[#1C1917]">
                  Profil Sanggar / Toko UMKM
                </h2>
                <p className="text-[14px] text-[#575049] mt-1">
                  Informasi ini akan ditampilkan di etalase publik Batik Wicara Trenggalek.
                </p>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="p-3.5 rounded-md bg-[#9E2A2B]/8 border border-[#9E2A2B]/30 text-[#9E2A2B] text-[13px] font-medium flex items-start gap-2.5 fade-panel"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="reg-shop-name"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Nama Sanggar / Toko UMKM *
                  </label>
                  <input
                    id="reg-shop-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={255}
                    value={form.name}
                    onChange={handleFieldChange('name')}
                    placeholder="Contoh: Batik Tulis Sekar Jagad Trenggalek"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reg-whatsapp"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Nomor WhatsApp Pemesanan
                  </label>
                  <input
                    id="reg-whatsapp"
                    type="tel"
                    maxLength={20}
                    value={form.number}
                    onChange={handleFieldChange('number')}
                    placeholder="081234567890"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reg-instagram"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Instagram
                  </label>
                  <input
                    id="reg-instagram"
                    type="text"
                    maxLength={255}
                    value={form.instagram}
                    onChange={handleFieldChange('instagram')}
                    placeholder="@namasanggar"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="reg-address"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Alamat Bengkel / Galeri
                  </label>
                  <input
                    id="reg-address"
                    type="text"
                    value={form.address}
                    onChange={handleFieldChange('address')}
                    placeholder="Jl. Raya Gandusari No. 12, Kab. Trenggalek"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reg-online-shop"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Tautan Toko Online (Shopee / Tokopedia)
                  </label>
                  <input
                    id="reg-online-shop"
                    type="url"
                    maxLength={255}
                    value={form.online_shop}
                    onChange={handleFieldChange('online_shop')}
                    placeholder="https://shopee.co.id/namasanggar"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reg-gmaps"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Tautan Google Maps
                  </label>
                  <input
                    id="reg-gmaps"
                    type="url"
                    maxLength={255}
                    value={form.gmaps}
                    onChange={handleFieldChange('gmaps')}
                    placeholder="https://maps.google.com/?q=..."
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="reg-description"
                  className="block text-[13px] font-medium text-[#1C1917]"
                >
                  Deskripsi Singkat Sanggar
                </label>
                <textarea
                  id="reg-description"
                  rows={3}
                  value={form.description}
                  onChange={handleFieldChange('description')}
                  placeholder="Ceritakan keunikan motif, teknik pembatikan, atau keunggulan karya sanggar Anda..."
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="taste-btn-primary w-full disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mendaftarkan Sanggar...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Daftarkan Sanggar &amp; Masuk Dasbor</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>

      <footer className="py-5 px-4 text-center text-[13px] text-[#575049] border-t border-[#1C1917]/12">
        Sistem Manajemen Katalog Terisolasi Per Sanggar · Kabupaten Trenggalek
      </footer>
    </div>
  );
}