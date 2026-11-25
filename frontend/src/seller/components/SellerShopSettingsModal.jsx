import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Store, Upload, Trash2, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { useBackendMediaUrl } from '../../utils/useBackendMediaUrl';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (selaras dengan storage/config.py)

export default function SellerShopSettingsModal({ isOpen, onClose, shop, onSaveShop }) {
  const [form, setForm] = useState(() => ({
    name: shop?.name || '',
    address: shop?.address || '',
    number: shop?.number || '',
    instagram: shop?.instagram || '',
    online_shop: shop?.online_shop || '',
    gmaps: shop?.gmaps || '',
    description: shop?.description || '',
    active_status: shop?.active_status !== false,
  }));

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [removeProfile, setRemoveProfile] = useState(false);
  const [existingImgError, setExistingImgError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef(null);

  // Bersihkan Object URL pratinjau logo agar tidak bocor memori
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  if (!isOpen || !shop) return null;

  const { src: resolvedExistingLogo, failed: existingLogoFailed } = useBackendMediaUrl(
    isOpen ? shop?.profile_public_url : ''
  );

  if (!isOpen || !shop) return null;

  const existingLogoUrl =
    !existingImgError && !existingLogoFailed ? resolvedExistingLogo : '';
  const displayedLogoUrl = logoPreviewUrl || (removeProfile ? '' : existingLogoUrl);
  const hasVisibleLogo = Boolean(displayedLogoUrl);

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
    setRemoveProfile(false);
  };

  const handleRemoveLogo = () => {
    setErrorMsg('');
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    setLogoFile(null);
    setLogoPreviewUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (shop.profile_public_url) {
      setRemoveProfile(true);
    }
  };

  const handleRestoreExistingLogo = () => {
    setErrorMsg('');
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    setLogoFile(null);
    setLogoPreviewUrl('');
    setRemoveProfile(false);
    setExistingImgError(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (form.name.trim().length < 2) {
      setErrorMsg('Nama sanggar UMKM minimal 2 karakter.');
      return;
    }

    setIsSaving(true);
    try {
      await onSaveShop(form, {
        profileImageFile: logoFile,
        removeProfile,
      });
    } catch (err) {
      setErrorMsg(err?.message || 'Gagal menyimpan profil sanggar. Silakan coba kembali.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1C1917]/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-lg bg-[#FAF8F3] border border-[#1C1917]/15 shadow-2xl overflow-hidden my-6 fade-panel">
        <div className="px-6 py-4 bg-[#1B1714] text-[#F5F1E8] flex items-center justify-between border-b border-white/12">
          <div className="flex items-center gap-3">
            <Store className="w-5 h-5 text-[#C4A46B]" />
            <div>
              <span className="text-[13px] text-[#C4A46B] block">
                Identitas Sampul &amp; Halaman 1 Buku Katalog
              </span>
              <h3 className="font-serif font-normal text-lg">Pengaturan Profil Sanggar</h3>
            </div>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            aria-label="Tutup pengaturan sanggar"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-50 text-[#F5F1E8] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-md bg-[#9E2A2B]/8 border border-[#9E2A2B]/30 text-[#9E2A2B] text-[13px] font-medium flex items-start gap-2.5 fade-panel"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Pengaturan Logo UMKM */}
          <div className="rounded-md bg-[#FCFBF8] border border-[#1C1917]/12 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-20 h-20 rounded-lg border border-[#1C1917]/15 bg-[#EFEAE0] overflow-hidden flex items-center justify-center shrink-0">
              {hasVisibleLogo ? (
                <img
                  src={displayedLogoUrl}
                  alt={`Logo ${form.name || 'Sanggar'}`}
                  onError={() => {
                    if (!logoPreviewUrl) setExistingImgError(true);
                  }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Store className="w-7 h-7 text-[#7C3219]/70" />
              )}
            </div>

            <div className="space-y-2 min-w-0 flex-1">
              <div>
                <span className="block text-[13px] font-medium text-[#1C1917]">
                  Logo / Foto Profil Sanggar
                </span>
                <p className="text-[12px] text-[#575049]">
                  Format JPG, PNG, atau WebP (maks. 5 MB). Otomatis dioptimalkan ke WebP.
                </p>
              </div>

              <input
                ref={fileInputRef}
                id="settings-shop-logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={isSaving}
                onChange={handleLogoSelect}
                className="sr-only"
              />

              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="settings-shop-logo"
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-md bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/20 text-[13px] font-medium text-[#1C1917] transition-colors ${
                    isSaving ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 text-[#7C3219]" />
                  <span>{hasVisibleLogo ? 'Ganti Logo' : 'Unggah Logo'}</span>
                </label>

                {hasVisibleLogo && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-md bg-[#FCFBF8] hover:bg-[#9E2A2B]/10 disabled:opacity-50 border border-[#9E2A2B]/30 text-[13px] font-medium text-[#9E2A2B] cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Logo</span>
                  </button>
                )}

                {removeProfile && shop.profile_public_url && !logoFile && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleRestoreExistingLogo}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-md bg-[#F7F4EE] hover:bg-[#EFEAE0] disabled:opacity-50 border border-[#1C1917]/15 text-[13px] font-medium text-[#575049] cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Batalkan Hapus</span>
                  </button>
                )}
              </div>

              {logoFile && (
                <p className="text-[12px] text-[#1F5E3B] truncate">
                  Logo baru siap diunggah: {logoFile.name} ({(logoFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
              {removeProfile && !logoFile && (
                <p className="text-[12px] text-[#9E2A2B]">
                  Logo saat ini akan dihapus saat Anda menekan Simpan Profil Sanggar.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label htmlFor="shop-name" className="block text-[13px] font-medium text-[#1C1917]">
                Nama Sanggar UMKM *
              </label>
              <input
                id="shop-name"
                type="text"
                required
                minLength={2}
                maxLength={255}
                disabled={isSaving}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="shop-wa" className="block text-[13px] font-medium text-[#1C1917]">
                Nomor WhatsApp Pemesanan
              </label>
              <input
                id="shop-wa"
                type="tel"
                maxLength={20}
                disabled={isSaving}
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                placeholder="081234567890"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] font-mono text-[#1C1917] tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="shop-address" className="block text-[13px] font-medium text-[#1C1917]">
              Alamat Lengkap Sanggar
            </label>
            <input
              id="shop-address"
              type="text"
              disabled={isSaving}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Jl. Raya Gandusari No. 12, Kab. Trenggalek"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="shop-desc" className="block text-[13px] font-medium text-[#1C1917]">
              Deskripsi Profil Sanggar
            </label>
            <textarea
              id="shop-desc"
              rows={3}
              disabled={isSaving}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ceritakan keunggulan motif atau teknik pembatikan sanggar Anda..."
              className="w-full px-3.5 py-2.5 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="shop-online"
                className="block text-[13px] font-medium text-[#1C1917]"
              >
                Tautan Toko Online
              </label>
              <input
                id="shop-online"
                type="url"
                maxLength={255}
                disabled={isSaving}
                value={form.online_shop}
                onChange={(e) => setForm({ ...form, online_shop: e.target.value })}
                placeholder="https://shopee.co.id/..."
                className="w-full min-h-[44px] px-3 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="shop-ig" className="block text-[13px] font-medium text-[#1C1917]">
                Instagram
              </label>
              <input
                id="shop-ig"
                type="text"
                maxLength={255}
                disabled={isSaving}
                value={form.instagram}
                onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                placeholder="@namasanggar atau URL"
                className="w-full min-h-[44px] px-3 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="shop-maps" className="block text-[13px] font-medium text-[#1C1917]">
                Tautan Google Maps
              </label>
              <input
                id="shop-maps"
                type="url"
                maxLength={255}
                disabled={isSaving}
                value={form.gmaps}
                onChange={(e) => setForm({ ...form, gmaps: e.target.value })}
                placeholder="https://maps.google.com/..."
                className="w-full min-h-[44px] px-3 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
              />
            </div>
          </div>

          {/* Toggle Status Tayang Sanggar */}
          <label
            htmlFor="shop-active-status"
            className="flex items-start gap-3 rounded-md bg-[#FCFBF8] border border-[#1C1917]/12 p-3.5 cursor-pointer"
          >
            <input
              id="shop-active-status"
              type="checkbox"
              disabled={isSaving}
              checked={form.active_status}
              onChange={(e) => setForm({ ...form, active_status: e.target.checked })}
              className="mt-1 w-4 h-4 accent-[#7C3219] cursor-pointer"
            />
            <span className="text-[13px] leading-relaxed">
              <strong className="block text-[#1C1917]">Tampilkan sanggar di etalase publik</strong>
              <span className="text-[#575049]">
                Jika dinonaktifkan, sanggar dan seluruh produknya disembunyikan sementara dari
                halaman pengunjung.
              </span>
            </span>
          </label>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#1C1917]/12">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="taste-btn-secondary disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="taste-btn-primary disabled:opacity-70"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Simpan Profil Sanggar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}