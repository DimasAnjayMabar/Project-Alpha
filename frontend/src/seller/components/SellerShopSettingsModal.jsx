import React, { useState, useEffect } from 'react';
import { X, Save, Store } from 'lucide-react';

export default function SellerShopSettingsModal({ isOpen, onClose, shop, onSaveShop }) {
  const [form, setForm] = useState({
    name: '',
    address: '',
    number: '',
    instagram: '',
    online_shop: '',
    gmaps: '',
    description: '',
    active_status: true,
  });

  useEffect(() => {
    if (isOpen && shop) {
      setForm({
        name: shop.name || '',
        address: shop.address || '',
        number: shop.number || '',
        instagram: shop.instagram || '',
        online_shop: shop.online_shop || '',
        gmaps: shop.gmaps || '',
        description: shop.description || '',
        active_status: shop.active_status !== false,
      });
    }
  }, [isOpen, shop]);

  if (!isOpen || !shop) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveShop(form);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-[#FCF9F2] border border-[#DFD2BC] shadow-2xl overflow-hidden my-6">
        <div className="px-6 py-4 bg-[#2C241E] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Store className="w-5 h-5 text-amber-300" />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300 block">
                Identitas Sampul &amp; Halaman 1 Buku Katalog
              </span>
              <h3 className="font-serif text-lg font-bold">Pengaturan Profil Sanggar</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-[#2C241E]">Nama Sanggar UMKM *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFD2BC] text-xs font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-[#2C241E]">
                Nomor WhatsApp Pemesanan *
              </label>
              <input
                type="text"
                required
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                placeholder="6281234567801"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFD2BC] text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#2C241E]">Alamat Lengkap Sanggar *</label>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFD2BC] text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#2C241E]">
              Deskripsi Profil Sanggar *
            </label>
            <textarea
              rows={3}
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#DFD2BC] text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-[#2C241E]">Tautan Toko Online</label>
              <input
                type="url"
                value={form.online_shop}
                onChange={(e) => setForm({ ...form, online_shop: e.target.value })}
                placeholder="https://shopee.co.id/..."
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#DFD2BC] text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-[#2C241E]">Tautan Instagram</label>
              <input
                type="url"
                value={form.instagram}
                onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                placeholder="https://instagram.com/..."
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#DFD2BC] text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-[#2C241E]">Tautan Google Maps</label>
              <input
                type="url"
                value={form.gmaps}
                onChange={(e) => setForm({ ...form, gmaps: e.target.value })}
                placeholder="https://maps.google.com/..."
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#DFD2BC] text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E6DDD0]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white border border-[#DFD2BC] text-xs font-bold text-[#6B5B4E] cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#8B3A1E] hover:bg-[#A34424] text-white text-xs font-bold cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Profil Sanggar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}