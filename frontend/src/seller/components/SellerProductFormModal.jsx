import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ImagePlus,
  Trash2,
  Save,
  Sparkles,
  Link as LinkIcon,
} from 'lucide-react';
import ProductArtwork from '../../user/components/ProductArtwork';
import { formatAttributeLabel } from '../../user/utils/helpers';

/**
 * Mengompres gambar lokal agar hemat kapasitas localStorage (maks lebar 800px).
 */
function compressImageFileToDataUrl(file, maxWidth = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(ev.target?.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = String(ev.target?.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SellerProductFormModal({
  isOpen,
  onClose,
  initialProduct,
  categories,
  categoryAttributes,
  shopId,
  onSaveProduct,
}) {
  const defaultCategoryId = categories[0]?.id || 'cat-0001-0000-0000-000000000001';

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [price, setPrice] = useState('150000');
  const [description, setDescription] = useState('');
  const [productLink, setProductLink] = useState('');
  const [activeStatus, setActiveStatus] = useState(true);
  const [attrValues, setAttrValues] = useState({});
  const [imageUrls, setImageUrls] = useState([]);
  const [newUrlInput, setNewUrlInput] = useState('');
  const [uploadingImg, setUploadingImg] = useState(false);

  const activeSchemaList = useMemo(() => {
    return (categoryAttributes || [])
      .filter((a) => a.category_id === categoryId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [categoryAttributes, categoryId]);

  useEffect(() => {
    if (!isOpen) return;

    if (initialProduct) {
      setName(initialProduct.name || '');
      setCategoryId(initialProduct.category_id || defaultCategoryId);
      setPrice(String(initialProduct.price ?? ''));
      setDescription(initialProduct.description || '');
      setProductLink(initialProduct.product_link || '');
      setActiveStatus(initialProduct.active_status !== false);
      setAttrValues({ ...(initialProduct.additional_attribute || {}) });
      setImageUrls(
        (initialProduct.displayImages || []).map((img) => img.image_url).filter(Boolean)
      );
    } else {
      setName('');
      setCategoryId(defaultCategoryId);
      setPrice('150000');
      setDescription('');
      setProductLink('');
      setActiveStatus(true);
      setAttrValues({});
      setImageUrls([]);
    }
    setNewUrlInput('');
  }, [isOpen, initialProduct, defaultCategoryId]);

  if (!isOpen) return null;

  const handleAttrChange = (attrName, type, rawVal) => {
    setAttrValues((prev) => ({
      ...prev,
      [attrName]: type === 'number' ? (rawVal === '' ? '' : Number(rawVal)) : rawVal,
    }));
  };

  const handleLocalFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingImg(true);
    try {
      const compressedList = await Promise.all(
        files.map((file) => compressImageFileToDataUrl(file))
      );
      setImageUrls((prev) => [...prev, ...compressedList]);
    } finally {
      setUploadingImg(false);
      e.target.value = '';
    }
  };

  const handleAddImageUrl = () => {
    const trimmed = newUrlInput.trim();
    if (!trimmed) return;
    setImageUrls((prev) => [...prev, trimmed]);
    setNewUrlInput('');
  };

  const handleRemoveImage = (index) => {
    setImageUrls((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Susun additional_attribute bersih sesuai skema kategori terpilih
    const cleanedAttributes = {};
    activeSchemaList.forEach((schema) => {
      const val = attrValues[schema.name];
      if (schema.type === 'boolean') {
        cleanedAttributes[schema.name] = Boolean(val);
      } else if (schema.type === 'number') {
        cleanedAttributes[schema.name] = val === '' || val === undefined ? 0 : Number(val);
      } else {
        cleanedAttributes[schema.name] = val !== undefined ? String(val).trim() : '';
      }
    });

    onSaveProduct(
      {
        name,
        category_id: categoryId,
        price: Number(price),
        description,
        additional_attribute: cleanedAttributes,
        active_status: activeStatus,
        product_link: productLink,
      },
      imageUrls
    );
  };

  const previewProductObj = {
    name: name || 'Pratinjau Motif Batik',
    shop_id: shopId,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-3xl bg-[#FCF9F2] border border-[#DFD2BC] shadow-2xl overflow-hidden my-6">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-[#2C241E] text-white flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300 block">
              Manajemen Katalog Sanggar
            </span>
            <h3 className="font-serif text-xl font-bold">
              {initialProduct ? `Edit Produk: ${initialProduct.name}` : 'Tambah Produk Batik Baru'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Pratinjau Visual Motif */}
            <div className="md:col-span-4 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B3A1E] block">
                Pratinjau Tampilan Katalog
              </span>
              <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-[#DFD2BC] bg-white">
                <ProductArtwork
                  product={previewProductObj}
                  imageUrl={imageUrls[0] || ''}
                  size={320}
                  className="w-full h-full"
                />
              </div>
              <p className="text-[10.5px] text-[#6B5B4E] leading-relaxed">
                Jika foto belum diunggah, sistem otomatis menampilkan ilustrasi motif batik sesuai nama produk Anda.
              </p>
            </div>

            {/* Kolom Utama */}
            <div className="md:col-span-8 space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-[#2C241E]">
                  Nama Produk / Motif *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Batik Tulis Turonggo Yakso Sogan"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFD2BC] text-xs font-medium text-[#2C241E] focus:outline-none focus:border-[#8B3A1E]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[#2C241E]">
                    Kategori Produk *
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFD2BC] text-xs font-bold text-[#2C241E] focus:outline-none focus:border-[#8B3A1E]"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[#2C241E]">
                    Harga Satuan (Rp) *
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFD2BC] text-xs font-bold text-[#2C241E] focus:outline-none focus:border-[#8B3A1E]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-[#2C241E]">
                  Filosofi &amp; Deskripsi Produk *
                </label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan makna motif, asal inspirasi Trenggalek, atau keunggulan kain..."
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#DFD2BC] text-xs text-[#2C241E] focus:outline-none focus:border-[#8B3A1E]"
                />
              </div>
            </div>
          </div>

          {/* Atribut Dinamis Sesuai Skema Kategori */}
          <div className="p-4 rounded-2xl bg-white border border-[#DFD2BC] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#8B3A1E] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Spesifikasi Wajib &amp; Tambahan Kategori</span>
              </span>
              <span className="text-[10px] text-[#6B5B4E]">
                Otomatis menyesuaikan kategori pilihan
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeSchemaList.map((schema) => {
                const label = formatAttributeLabel(schema.name);
                const val = attrValues[schema.name];

                if (schema.type === 'boolean') {
                  return (
                    <label
                      key={schema.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] cursor-pointer"
                    >
                      <span className="text-xs font-bold text-[#2C241E]">
                        {label} {schema.required && <span className="text-[#8B3A1E]">*</span>}
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(val)}
                        onChange={(e) =>
                          handleAttrChange(schema.name, 'boolean', e.target.checked)
                        }
                        className="w-4 h-4 accent-[#8B3A1E]"
                      />
                    </label>
                  );
                }

                return (
                  <div key={schema.id} className="space-y-1">
                    <label className="block text-xs font-bold text-[#2C241E]">
                      {label} {schema.required && <span className="text-[#8B3A1E]">*</span>}
                    </label>
                    <input
                      type={schema.type === 'number' ? 'number' : 'text'}
                      required={schema.required}
                      value={val ?? ''}
                      onChange={(e) => handleAttrChange(schema.name, schema.type, e.target.value)}
                      placeholder={
                        schema.name === 'teknik_batik'
                          ? 'Batik Tulis / Batik Cap'
                          : schema.name === 'bahan_kain'
                          ? 'Katun Primisima'
                          : schema.name === 'ukuran_lembar'
                          ? '215 cm x 115 cm'
                          : schema.name === 'ukuran'
                          ? 'M, L, XL, XXL'
                          : schema.name === 'berat_gram'
                          ? '320'
                          : ''
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs text-[#2C241E] focus:outline-none focus:border-[#8B3A1E]"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Galeri Foto Produk */}
          <div className="p-4 rounded-2xl bg-white border border-[#DFD2BC] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#8B3A1E]">
                Galeri Foto Produk ({imageUrls.length} Foto)
              </span>

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#8B3A1E] hover:bg-[#A34424] text-white text-xs font-bold cursor-pointer">
                <ImagePlus className="w-3.5 h-3.5" />
                <span>{uploadingImg ? 'Memproses Foto...' : 'Unggah Foto dari Perangkat'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleLocalFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newUrlInput}
                onChange={(e) => setNewUrlInput(e.target.value)}
                placeholder="Atau tempel URL gambar (https://...)"
                className="flex-1 px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs"
              />
              <button
                type="button"
                onClick={handleAddImageUrl}
                className="px-3.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-amber-50 border border-[#DFD2BC] text-xs font-bold text-[#2C241E] cursor-pointer"
              >
                Tambah URL
              </button>
            </div>

            {imageUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 pt-1">
                {imageUrls.map((url, idx) => (
                  <div
                    key={`${idx}-${url.slice(0, 20)}`}
                    className="relative group aspect-square rounded-xl overflow-hidden border border-[#DFD2BC] bg-[#FAF7F2]"
                  >
                    <img src={url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-bold">
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-red-600 text-white opacity-90 hover:opacity-100 cursor-pointer"
                      title="Hapus foto"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tautan Marketplace & Status Tayang */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div className="sm:col-span-8 space-y-1">
              <label className="block text-xs font-bold text-[#2C241E]">
                Tautan Shopee / Tokopedia (Opsional)
              </label>
              <div className="relative">
                <LinkIcon className="w-3.5 h-3.5 text-[#6B5B4E] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={productLink}
                  onChange={(e) => setProductLink(e.target.value)}
                  placeholder="https://shopee.co.id/..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-[#DFD2BC] text-xs"
                />
              </div>
            </div>

            <div className="sm:col-span-4 pt-4">
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#DFD2BC] cursor-pointer">
                <span className="text-xs font-bold text-[#2C241E]">Tampilkan di Katalog</span>
                <input
                  type="checkbox"
                  checked={activeStatus}
                  onChange={(e) => setActiveStatus(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
              </label>
            </div>
          </div>

          {/* Tombol Aksi */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E6DDD0]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-stone-100 border border-[#DFD2BC] text-xs font-bold text-[#6B5B4E] cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#8B3A1E] hover:bg-[#A34424] text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{initialProduct ? 'Simpan Perubahan' : 'Terbitkan ke Buku Katalog'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}