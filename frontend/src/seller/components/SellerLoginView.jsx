import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  preloadGoogleGsiScript,
  openGoogleCodePopup,
  exchangeGoogleAuthCode,
} from '../utils/sellerService';

const ERROR_MESSAGES = {
  oauth_failed:
    'Proses masuk dengan Google dibatalkan atau gagal. Silakan coba kembali.',
  email_unavailable:
    'Alamat email dari akun Google tidak dapat dibaca. Pastikan Anda memilih akun Google yang aktif.',
  session_expired:
    'Sesi pendaftaran sanggar telah berakhir. Silakan masuk ulang menggunakan akun Google Anda.',
};

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

export default function SellerLoginView({ onBackToCatalog, onLoginSuccess }) {
  const [errorMsg, setErrorMsg] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    preloadGoogleGsiScript().catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error');
    if (errorCode) {
      setErrorMsg(
        ERROR_MESSAGES[errorCode] ||
          'Terjadi kendala saat proses autentikasi Google. Silakan coba lagi.'
      );
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleGoogleLogin = () => {
    setErrorMsg('');
    setIsRedirecting(true);

    openGoogleCodePopup({
      onCode: async (code) => {
        try {
          const result = await exchangeGoogleAuthCode(code);
          if (result.status === 'need_registration') {
            // Navigasi lokal ke halaman frontend /register (tidak melewati ngrok)
            window.location.assign('/register');
            return;
          }
          if (onLoginSuccess) {
            onLoginSuccess();
          } else {
            window.location.assign('/seller');
          }
        } catch (err) {
          setErrorMsg(
            err?.message || 'Gagal menyelesaikan autentikasi Google. Silakan coba kembali.'
          );
          setIsRedirecting(false);
        }
      },
      onError: (msg) => {
        setErrorMsg(msg);
        setIsRedirecting(false);
      },
      onCancel: () => {
        setIsRedirecting(false);
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#F7F4EE] text-[#1C1917] flex flex-col justify-between">
      {/* Header Atas */}
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
                Portal Perajin UMKM
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

      {/* Konten Utama */}
      <main className="taste-wrap w-full py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Kolom Kiri: Penjelasan Akses */}
        <div className="lg:col-span-5 space-y-5 hero-enter-title">
          <div className="rounded-lg bg-[#1B1714] text-[#F5F1E8] p-6 sm:p-8 space-y-4">
            <div className="inline-flex items-center gap-2 text-[#C4A46B] text-[13px] font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Satu akun Google · Satu sanggar UMKM</span>
            </div>
            <h1 className="font-serif font-normal text-2xl sm:text-3xl leading-snug">
              Kelola Katalog Sanggar Secara Mandiri
            </h1>
            <p className="text-[14px] text-[#B5ACA2] leading-relaxed">
              Masuk cukup menggunakan akun Google tanpa perlu mengingat kata sandi tambahan.
              Akun Google hanya dipakai untuk verifikasi alamat email pemilik sanggar.
            </p>
          </div>

          <div className="rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-5 space-y-3 text-[13px] text-[#575049]">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#1F5E3B] shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#1C1917]">Sudah terdaftar?</strong> Langsung masuk ke
                dasbor sanggar Anda begitu verifikasi Google selesai.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#1F5E3B] shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#1C1917]">Sanggar baru?</strong> Anda akan diarahkan
                otomatis ke formulir pendaftaran toko beserta unggah logo UMKM sendiri.
              </span>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Kartu Login Google */}
        <div className="lg:col-span-7 rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-6 sm:p-10 space-y-6 hero-enter-step-1">
          <div className="space-y-2">
            <span className="text-[13px] font-medium text-[#7C3219]">
              Autentikasi Pengelola Sanggar
            </span>
            <h2 className="font-serif font-normal text-2xl sm:text-3xl text-[#1C1917]">
              Masuk atau Daftar dengan Google
            </h2>
            <p className="text-[14px] text-[#575049] leading-relaxed">
              Pilih akun Google yang ingin dihubungkan dengan sanggar batik Anda. Kami hanya
              mengambil alamat email untuk mengenali kepemilikan toko—foto logo sanggar tetap
              dapat Anda unggah sendiri.
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

          <div className="space-y-3 pt-1">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isRedirecting}
              className="w-full min-h-[52px] px-5 py-3 rounded-md bg-[#1B1714] hover:bg-[#2E2722] disabled:opacity-70 text-[#F5F1E8] text-[15px] font-medium flex items-center justify-center gap-3 transition-colors cursor-pointer shadow-sm"
            >
              {isRedirecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-[#C4A46B]" />
                  <span>Mengarahkan ke Google...</span>
                </>
              ) : (
                <>
                  <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
                    <GoogleMark />
                  </span>
                  <span>Lanjutkan dengan Google</span>
                </>
              )}
            </button>

            <p className="text-[12px] text-[#575049] text-center">
              Sesi login diamankan menggunakan cookie terenkripsi (HttpOnly).
            </p>
          </div>
        </div>
      </main>

      <footer className="py-5 px-4 text-center text-[13px] text-[#575049] border-t border-[#1C1917]/12">
        Sistem Manajemen Katalog Terisolasi Per Sanggar · Kabupaten Trenggalek
      </footer>
    </div>
  );
}

