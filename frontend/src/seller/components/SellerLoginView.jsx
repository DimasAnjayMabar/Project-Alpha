import React, { useState } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  ArrowLeft,
  UserPlus,
  LogIn,
  KeyRound,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { authenticateSeller, registerNewSeller } from '../utils/sellerService';

export default function SellerLoginView({ db, onLoginSuccess, onBackToCatalog }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('sekarjagad.trenggalek@gmail.com');
  const [password, setPassword] = useState('123456');
  const [errorMsg, setErrorMsg] = useState('');

  // State registrasi UMKM baru
  const [regForm, setRegForm] = useState({
    displayName: '',
    email: '',
    password: '',
    shopName: '',
    address: '',
    whatsapp: '',
    description: '',
  });

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const { account, shop } = authenticateSeller(db, email, password);
      onLoginSuccess(account, shop, db);
    } catch (err) {
      setErrorMsg(err.message || 'Gagal masuk ke portal seller.');
    }
  };

  const handleQuickFillAccount = (accEmail) => {
    setMode('login');
    setEmail(accEmail);
    setPassword('123456');
    setErrorMsg('');
  };

  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const { updatedDb, account, shop } = registerNewSeller(db, regForm);
      onLoginSuccess(account, shop, updatedDb);
    } catch (err) {
      setErrorMsg(err.message || 'Gagal mendaftarkan sanggar baru.');
    }
  };

  const registeredSellers = (db.account || [])
    .filter((a) => a.role === 'penjual')
    .map((acc) => ({
      account: acc,
      shop: (db.shop || []).find((s) => s.account_id === acc.id),
    }))
    .filter((item) => item.shop);

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
      <main className="taste-wrap w-full py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Kolom Kiri: Info Keamanan & Daftar Akun Sanggar */}
        <div className="lg:col-span-5 space-y-5 hero-enter-title">
          <div className="rounded-lg bg-[#1B1714] text-[#F5F1E8] p-6 sm:p-7 space-y-4">
            <div className="inline-flex items-center gap-2 text-[#C4A46B] text-[13px] font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Isolasi hak akses per sanggar</span>
            </div>
            <h1 className="font-serif font-normal text-2xl sm:text-3xl leading-snug">
              Kelola Katalog Sanggar Secara Mandiri
            </h1>
            <p className="text-[14px] text-[#B5ACA2] leading-relaxed">
              Setiap akun pengelola terkunci pada satu sanggar UMKM. Anda dapat menambah,
              memperbarui, maupun menghapus koleksi sanggar Anda sendiri tanpa tercampur dengan
              sanggar lain.
            </p>
          </div>

          <div className="rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-[#7C3219]">
                Akun sanggar terdaftar ({registeredSellers.length})
              </span>
              <span className="text-[13px] font-mono text-[#575049]">PIN Demo: 123456</span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {registeredSellers.map(({ account, shop }) => {
                const isSelected = email.toLowerCase() === account.email.toLowerCase();
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => handleQuickFillAccount(account.email)}
                    className={`w-full min-h-[52px] p-3 rounded-md border text-left transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-[#EFEAE0] border-[#7C3219]'
                        : 'bg-[#F7F4EE] hover:bg-white border-[#1C1917]/12'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="font-serif font-medium text-[15px] text-[#1C1917] block truncate">
                        {shop.name}
                      </span>
                      <span className="text-[13px] text-[#575049] block truncate">
                        {account.display_name} · {account.email}
                      </span>
                    </div>
                    <span className="shrink-0 text-[13px] font-medium text-[#7C3219]">
                      Pilih
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Form Login / Registrasi */}
        <div className="lg:col-span-7 rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-6 sm:p-8 space-y-6 hero-enter-step-1">
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-[#EFEAE0] border border-[#1C1917]/12">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg('');
              }}
              className={`min-h-[42px] px-3 rounded-sm text-[13px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-[#1B1714] text-[#F5F1E8]'
                  : 'text-[#575049] hover:text-[#1C1917]'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Masuk Akun Sanggar</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg('');
              }}
              className={`min-h-[42px] px-3 rounded-sm text-[13px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-[#1B1714] text-[#F5F1E8]'
                  : 'text-[#575049] hover:text-[#1C1917]'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Daftar UMKM Baru</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-md bg-[#9E2A2B]/8 border border-[#9E2A2B]/30 text-[#9E2A2B] text-[13px] font-medium flex items-start gap-2.5 fade-panel">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form key="login-form" onSubmit={handleLoginSubmit} className="space-y-4 fade-swap">
              <div>
                <h2 className="font-serif font-normal text-2xl text-[#1C1917]">
                  Masuk ke Dasbor Pengelola
                </h2>
                <p className="text-[14px] text-[#575049] mt-1">
                  Gunakan email pengelola sanggar yang terdaftar pada sistem Batik Wicara.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-[13px] font-medium text-[#1C1917]">
                  Email Pengelola Sanggar
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#575049] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama.sanggar@gmail.com"
                    className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-[13px] font-medium text-[#1C1917]"
                >
                  Kata Sandi / PIN Akses Sanggar
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#575049] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>
              </div>

              <button type="submit" className="taste-btn-primary w-full">
                <Lock className="w-4 h-4" />
                <span>Masuk &amp; Kelola Katalog UMKM</span>
              </button>
            </form>
          ) : (
            <form
              key="register-form"
              onSubmit={handleRegisterSubmit}
              className="space-y-4 fade-swap"
            >
              <div>
                <h2 className="font-serif font-normal text-2xl text-[#1C1917]">
                  Pendaftaran Sentra UMKM Baru
                </h2>
                <p className="text-[14px] text-[#575049] mt-1">
                  Otomatis membuat buku katalog khusus untuk sanggar Anda di etalase utama.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="reg-display-name"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Nama Lengkap Pengelola *
                  </label>
                  <input
                    id="reg-display-name"
                    type="text"
                    required
                    value={regForm.displayName}
                    onChange={(e) => setRegForm({ ...regForm, displayName: e.target.value })}
                    placeholder="Contoh: Ibu Siti Aminah"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>

                <div className="space-y-1.5">
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
                    value={regForm.shopName}
                    onChange={(e) => setRegForm({ ...regForm, shopName: e.target.value })}
                    placeholder="Contoh: Batik Tulis Panggul"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reg-email"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Email Login *
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    placeholder="batikpanggul@gmail.com"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reg-password"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Buat Kata Sandi / PIN *
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reg-whatsapp"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Nomor WhatsApp Pemesanan *
                  </label>
                  <input
                    id="reg-whatsapp"
                    type="text"
                    required
                    value={regForm.whatsapp}
                    onChange={(e) => setRegForm({ ...regForm, whatsapp: e.target.value })}
                    placeholder="081234567890"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reg-address"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Alamat Bengkel / Galeri *
                  </label>
                  <input
                    id="reg-address"
                    type="text"
                    required
                    value={regForm.address}
                    onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                    placeholder="Kec. Panggul, Kab. Trenggalek"
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
                  rows={2}
                  value={regForm.description}
                  onChange={(e) => setRegForm({ ...regForm, description: e.target.value })}
                  placeholder="Ceritakan keunikan motif atau teknik pembatikan sanggar Anda..."
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                />
              </div>

              <button type="submit" className="taste-btn-primary w-full">
                <CheckCircle2 className="w-4 h-4" />
                <span>Daftarkan UMKM &amp; Masuk Dasbor</span>
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="py-5 px-4 text-center text-[13px] text-[#575049] border-t border-[#1C1917]/12">
        Sistem Manajemen Katalog Terisolasi Per Sanggar · Kabupaten Trenggalek
      </footer>
    </div>
  );
}
