import React, { useState } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  Store,
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
    <div className="min-h-screen bg-[#FAF7F2] text-[#2C241E] flex flex-col justify-between">
      {/* Header Atas */}
      <header className="bg-white/90 backdrop-blur-md border-b border-[#E6DDD0] px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#2C241E] text-amber-300 flex items-center justify-center font-serif font-bold text-lg">
            B
          </div>
          <div>
            <span className="font-serif font-bold text-base block leading-none">
              Portal Seller UMKM
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8B3A1E]">
              Batik Wicara Trenggalek
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToCatalog}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-amber-50 border border-[#E6DDD0] text-xs font-bold text-[#2C241E] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#8B3A1E]" />
          <span>Kembali ke Etalase Pembeli</span>
        </button>
      </header>

      {/* Konten Utama */}
      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Kolom Kiri: Info Keamanan & Daftar Akun Sanggar */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-3xl bg-gradient-to-br from-[#2C241E] via-[#3A281E] to-[#562917] text-white p-6 space-y-4 shadow-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-[11px] font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Isolasi Hak Akses Per UMKM</span>
            </div>
            <h1 className="font-serif text-2xl font-bold leading-snug">
              Kelola Katalog Sanggar Anda Secara Mandiri &amp; Aman
            </h1>
            <p className="text-xs text-stone-200 leading-relaxed">
              Setiap akun pengelola terkunci pada satu sanggar UMKM. Anda bebas menambah, memperbarui, maupun menghapus produk sanggar Anda sendiri tanpa risiko tercampur dengan sanggar lain.
            </p>
          </div>

          <div className="rounded-3xl bg-white border border-[#E6DDD0] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#8B3A1E]">
                Akun Sanggar Terdaftar ({registeredSellers.length})
              </span>
              <span className="text-[10px] font-mono bg-[#FAF7F2] px-2 py-0.5 rounded border border-[#E6DDD0] text-[#6B5B4E]">
                PIN Demo: 123456
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {registeredSellers.map(({ account, shop }) => {
                const isSelected = email.toLowerCase() === account.email.toLowerCase();
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => handleQuickFillAccount(account.email)}
                    className={`w-full p-3 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50/90 border-[#8B3A1E] ring-1 ring-[#8B3A1E]/25'
                        : 'bg-[#FAF7F2] hover:bg-white border-[#E6DDD0]'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="font-serif font-bold text-xs text-[#2C241E] block truncate">
                        {shop.name}
                      </span>
                      <span className="text-[10.5px] text-[#6B5B4E] block truncate">
                        {account.display_name} • {account.email}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold text-[#8B3A1E] px-2 py-1 rounded-lg bg-white border border-[#E6DDD0]">
                      Pilih
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Form Login / Registrasi */}
        <div className="lg:col-span-7 rounded-3xl bg-white border border-[#E6DDD0] p-6 sm:p-8 shadow-sm space-y-6">
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#FAF7F2] border border-[#E6DDD0]">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg('');
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-[#8B3A1E] text-white shadow-xs'
                  : 'text-[#6B5B4E] hover:text-[#2C241E]'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Masuk Akun Sanggar</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg('');
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-[#8B3A1E] text-white shadow-xs'
                  : 'text-[#6B5B4E] hover:text-[#2C241E]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Daftar UMKM Baru</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-[#2C241E]">
                  Masuk ke Dasbor Pengelola
                </h2>
                <p className="text-xs text-[#6B5B4E] mt-1">
                  Gunakan email pengelola sanggar yang terdaftar pada sistem Batik Wicara.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#2C241E]">
                  Email Pengelola Sanggar
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#6B5B4E] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama.sanggar@gmail.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs font-medium text-[#2C241E] focus:outline-none focus:border-[#8B3A1E]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#2C241E]">
                  Kata Sandi / PIN Akses Sanggar
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#6B5B4E] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs font-medium text-[#2C241E] focus:outline-none focus:border-[#8B3A1E]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-[#8B3A1E] hover:bg-[#A34424] text-white text-xs sm:text-sm font-bold shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Masuk &amp; Kelola Katalog UMKM</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-[#2C241E]">
                  Pendaftaran Sentra UMKM Baru
                </h2>
                <p className="text-xs text-[#6B5B4E] mt-1">
                  Otomatis membuat buku katalog khusus untuk sanggar Anda di etalase utama.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[#2C241E]">
                    Nama Lengkap Pengelola *
                  </label>
                  <input
                    type="text"
                    required
                    value={regForm.displayName}
                    onChange={(e) => setRegForm({ ...regForm, displayName: e.target.value })}
                    placeholder="Contoh: Ibu Siti Aminah"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[#2C241E]">
                    Nama Sanggar / Toko UMKM *
                  </label>
                  <input
                    type="text"
                    required
                    value={regForm.shopName}
                    onChange={(e) => setRegForm({ ...regForm, shopName: e.target.value })}
                    placeholder="Contoh: Batik Tulis Panggul"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[#2C241E]">
                    Email Login *
                  </label>
                  <input
                    type="email"
                    required
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    placeholder="batikpanggul@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[#2C241E]">
                    Buat Kata Sandi / PIN *
                  </label>
                  <input
                    type="password"
                    required
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[#2C241E]">
                    Nomor WhatsApp Pemesanan *
                  </label>
                  <input
                    type="text"
                    required
                    value={regForm.whatsapp}
                    onChange={(e) => setRegForm({ ...regForm, whatsapp: e.target.value })}
                    placeholder="081234567890"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[#2C241E]">
                    Alamat Bengkel / Galeri *
                  </label>
                  <input
                    type="text"
                    required
                    value={regForm.address}
                    onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                    placeholder="Kec. Panggul, Kab. Trenggalek"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-[#2C241E]">
                  Deskripsi Singkat Sanggar
                </label>
                <textarea
                  rows={2}
                  value={regForm.description}
                  onChange={(e) => setRegForm({ ...regForm, description: e.target.value })}
                  placeholder="Ceritakan keunikan motif atau teknik pembatikan sanggar Anda..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Daftarkan UMKM &amp; Masuk Dasbor</span>
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="py-5 px-4 text-center text-[11px] text-[#6B5B4E] border-t border-[#E6DDD0]">
        Sistem Manajemen Katalog Terisolasi Per Sanggar • Kabupaten Trenggalek
      </footer>
    </div>
  );
}