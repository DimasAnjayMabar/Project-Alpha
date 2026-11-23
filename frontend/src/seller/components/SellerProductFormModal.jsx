import React, { useState, useMemo } from 'react';
import {
  X,
  ImagePlus,
  Trash2,
  Save,
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

  const [name, setName] = useState(() => initialProduct?.name || '');
  const [categoryId, setCategoryId] = useState(
    () => initialProduct?.category_id || defaultCategoryId
  );
  const [price, setPrice] = useState(() =>
    initialProduct ? String(initialProduct.price ?? '') : '150000'
  );
  const [description, setDescription] = useState(() => initialProduct?.description || '');
  const [productLink, setProductLink] = useState(() => initialProduct?.product_link || '');
  const [activeStatus, setActiveStatus] = useState(() =>
    initialProduct ? initialProduct.active_status !== false : true
  );
  const [attrValues, setAttrValues] = useState(() => ({
    ...(initialProduct?.additional_attribute || {}),
  }));
  const [imageUrls, setImageUrls] = useState(() =>
    initialProduct
      ? (initialProduct.displayImages || []).map((img) => img.image_url).filter(Boolean)
      : []
  );
  const [newUrlInput, setNewUrlInput] = useState('');
  const [uploadingImg, setUploadingImg] = useState(false);

  const activeSchemaList = useMemo(() => {
    return (categoryAttributes || [])
      .filter((a) => a.category_id === categoryId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [categoryAttributes, categoryId]);

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
    <div className="fixed inset-0 z-50 bg-[#1C1917]/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-lg bg-[#FAF8F3] border border-[#1C1917]/15 shadow-2xl overflow-hidden my-6 fade-panel">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-[#1B1714] text-[#F5F1E8] flex items-center justify-between border-b border-white/12">
          <div>
            <span className="text-[13px] text-[#C4A46B] block">
              Manajemen Katalog Sanggar
            </span>
            <h3 className="font-serif font-normal text-xl">
              {initialProduct ? `Edit Produk: ${initialProduct.name}` : 'Tambah Produk Batik Baru'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal produk"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-[#F5F1E8] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Pratinjau Visual Motif */}
            <div className="md:col-span-4 space-y-2">
              <span className="text-[13px] font-medium text-[#7C3219] block">
                Pratinjau tampilan katalog
              </span>
              <div className="aspect-[4/3] rounded-md overflow-hidden border border-[#1C1917]/15 bg-[#FCFBF8]">
                <ProductArtwork
                  product={previewProductObj}
                  imageUrl={imageUrls[0] || ''}
                  size={320}
                  className="w-full h-full"
                />
              </div>
              <p className="text-[13px] text-[#575049] leading-relaxed">
                Jika foto belum diunggah, motif ilustrasi ditampilkan sesuai nama produk Anda.
              </p>
            </div>

            {/* Kolom Utama */}
            <div className="md:col-span-8 space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="prod-name" className="block text-[13px] font-medium text-[#1C1917]">
                  Nama Produk / Motif *
                </label>
                <input
                  id="prod-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Batik Tulis Turonggo Yakso Sogan"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="prod-category"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Kategori Produk *
                  </label>
                  <select
                    id="prod-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="prod-price"
                    className="block text-[13px] font-medium text-[#1C1917]"
                  >
                    Harga Satuan (Rp) *
                  </label>
                  <input
                    id="prod-price"
                    type="number"
                    min="1000"
                    step="500"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] font-medium text-[#1C1917] tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="prod-description"
                  className="block text-[13px] font-medium text-[#1C1917]"
                >
                  Filosofi &amp; Deskripsi Produk *
                </label>
                <textarea
                  id="prod-description"
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan makna motif, asal inspirasi Trenggalek, atau keunggulan kain..."
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                />
              </div>
            </div>
          </div>

          {/* Atribut Dinamis Sesuai Skema Kategori */}
          <div className="p-4 rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-[#7C3219]">
                Spesifikasi kategori
              </span>
              <span className="text-[13px] text-[#575049]">
                Menyesuaikan kategori pilihan
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeSchemaList.map((schema) => {
                const label = formatAttributeLabel(schema.name);
                const val = attrValues[schema.name];
                const fieldId = `attr-${schema.name}`;

                if (schema.type === 'boolean') {
                  return (
                    <label
                      key={schema.id}
                      htmlFor={fieldId}
                      className="flex items-center justify-between min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/15 cursor-pointer"
                    >
                      <span className="text-[13px] font-medium text-[#1C1917]">
                        {label} {schema.required && <span className="text-[#7C3219]">*</span>}
                      </span>
                      <input
                        id={fieldId}
                        type="checkbox"
                        checked={Boolean(val)}
                        onChange={(e) =>
                          handleAttrChange(schema.name, 'boolean', e.target.checked)
                        }
                        className="w-4 h-4 accent-[#7C3219]"
                      />
                    </label>
                  );
                }

                return (
                  <div key={schema.id} className="space-y-1">
                    <label htmlFor={fieldId} className="block text-[13px] font-medium text-[#1C1917]">
                      {label} {schema.required && <span className="text-[#7C3219]">*</span>}
                    </label>
                    <input
                      id={fieldId}
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
                      className="w-full min-h-[44px] px-3 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Galeri Foto Produk */}
          <div className="p-4 rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-[#7C3219]">
                Galeri foto produk ({imageUrls.length} foto)
              </span>

              <label className="taste-btn-primary">
                <ImagePlus className="w-4 h-4" />
                <span>{uploadingImg ? 'Memproses Foto...' : 'Unggah Foto'}</span>
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
                aria-label="URL foto produk"
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
              />
              <button
                type="button"
                onClick={handleAddImageUrl}
                className="taste-btn-secondary shrink-0"
              >
                Tambah URL
              </button>
            </div>

            {imageUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 pt-1">
                {imageUrls.map((url, idx) => (
                  <div
                    key={`${idx}-${url.slice(0, 20)}`}
                    className="relative group aspect-square rounded-md overflow-hidden border border-[#1C1917]/15 bg-[#F7F4EE]"
                  >
                    <img src={url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-[#1B1714]/85 text-[#F5F1E8] text-[13px] font-medium tabular-nums">
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1 right-1 p-1.5 rounded bg-[#9E2A2B] text-white opacity-90 hover:opacity-100 cursor-pointer"
                      aria-label={`Hapus foto ${idx + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tautan Marketplace & Status Tayang */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-8 space-y-1.5">
              <label
                htmlFor="prod-marketplace"
                className="block text-[13px] font-medium text-[#1C1917]"
              >
                Tautan Shopee / Tokopedia (Opsional)
              </label>
              <div className="relative">
                <LinkIcon className="w-4 h-4 text-[#575049] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="prod-marketplace"
                  type="url"
                  value={productLink}
                  onChange={(e) => setProductLink(e.target.value)}
                  placeholder="https://shopee.co.id/..."
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                />
              </div>
            </div>

            <div className="sm:col-span-4">
              <label
                htmlFor="prod-active-status"
                className="flex items-center justify-between min-h-[44px] px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 cursor-pointer"
              >
                <span className="text-[13px] font-medium text-[#1C1917]">Tampilkan di Katalog</span>
                <input
                  id="prod-active-status"
                  type="checkbox"
                  checked={activeStatus}
                  onChange={(e) => setActiveStatus(e.target.checked)}
                  className="w-4 h-4 accent-[#7C3219]"
                />
              </label>
            </div>
          </div>

          {/* Tombol Aksi */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#1C1917]/12">
            <button type="button" onClick={onClose} className="taste-btn-secondary">
              Batal
            </button>
            <button type="submit" className="taste-btn-primary">
              <Save className="w-4 h-4" />
              <span>{initialProduct ? 'Simpan Perubahan' : 'Terbitkan ke Buku Katalog'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
