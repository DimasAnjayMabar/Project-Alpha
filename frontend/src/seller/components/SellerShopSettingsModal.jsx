import React, { useState } from 'react';
import { X, Save, Store } from 'lucide-react';

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

  if (!isOpen || !shop) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveShop(form);
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
            onClick={onClose}
            aria-label="Tutup pengaturan sanggar"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-[#F5F1E8] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label htmlFor="shop-name" className="block text-[13px] font-medium text-[#1C1917]">
                Nama Sanggar UMKM *
              </label>
              <input
                id="shop-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="shop-wa" className="block text-[13px] font-medium text-[#1C1917]">
                Nomor WhatsApp Pemesanan *
              </label>
              <input
                id="shop-wa"
                type="text"
                required
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                placeholder="6281234567801"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] font-mono text-[#1C1917] tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="shop-address" className="block text-[13px] font-medium text-[#1C1917]">
              Alamat Lengkap Sanggar *
            </label>
            <input
              id="shop-address"
              type="text"
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="shop-desc" className="block text-[13px] font-medium text-[#1C1917]">
              Deskripsi Profil Sanggar *
            </label>
            <textarea
              id="shop-desc"
              rows={3}
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
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
                value={form.online_shop}
                onChange={(e) => setForm({ ...form, online_shop: e.target.value })}
                placeholder="https://shopee.co.id/..."
                className="w-full min-h-[44px] px-3 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="shop-ig" className="block text-[13px] font-medium text-[#1C1917]">
                Tautan Instagram
              </label>
              <input
                id="shop-ig"
                type="url"
                value={form.instagram}
                onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                placeholder="https://instagram.com/..."
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
                value={form.gmaps}
                onChange={(e) => setForm({ ...form, gmaps: e.target.value })}
                placeholder="https://maps.google.com/..."
                className="w-full min-h-[44px] px-3 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#1C1917]/12">
            <button type="button" onClick={onClose} className="taste-btn-secondary">
              Batal
            </button>
            <button type="submit" className="taste-btn-primary">
              <Save className="w-4 h-4" />
              <span>Simpan Profil Sanggar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
