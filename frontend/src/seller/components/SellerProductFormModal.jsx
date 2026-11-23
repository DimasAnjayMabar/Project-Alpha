import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  ImagePlus,
  Trash2,
  Save,
  Link as LinkIcon,
  Layers,
  RotateCcw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import ProductArtwork from '../../user/components/ProductArtwork';
import { formatAttributeLabel } from '../../user/utils/helpers';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_DISPLAY_FILES_PER_REQUEST = 10;
const MAX_DISPLAY_SIZE_BYTES = 5 * 1024 * 1024;  // 5 MB per gambar display
const MAX_MOCKUP_SIZE_BYTES = 15 * 1024 * 1024;  // 15 MB untuk mockup 3D WebP lossless

export default function SellerProductFormModal({
  isOpen,
  onClose,
  initialProduct,
  categories,
  categoryAttributes,
  shopId,
  onSaveProduct,
}) {
  const defaultCategoryId = categories[0]?.id || '';

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

  // Galeri foto produk: pisahkan gambar eksisting (dari DB) & file baru (lokal)
  const [existingDisplayImages, setExistingDisplayImages] = useState(() =>
    initialProduct
      ? [...(initialProduct.displayImages || [])].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0)
        )
      : []
  );
  const [deletedDisplayImageIds, setDeletedDisplayImageIds] = useState([]);
  const [newDisplayItems, setNewDisplayItems] = useState([]); // [{ id, file, previewUrl }]

  // Tekstur mockup 3D: eksisting (dari DB) vs file baru (lokal)
  const existingMockup = initialProduct?.mockup_image || null;
  const [newMockupFile, setNewMockupFile] = useState(null);
  const [newMockupPreviewUrl, setNewMockupPreviewUrl] = useState('');
  const [removeMockup, setRemoveMockup] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const mockupInputRef = useRef(null);
  const newDisplayItemsRef = useRef(newDisplayItems);
  const newMockupPreviewRef = useRef(newMockupPreviewUrl);

  useEffect(() => {
    newDisplayItemsRef.current = newDisplayItems;
  }, [newDisplayItems]);

  useEffect(() => {
    newMockupPreviewRef.current = newMockupPreviewUrl;
  }, [newMockupPreviewUrl]);

  // Bersihkan seluruh Object URL saat modal ditutup/unmount
  useEffect(() => {
    return () => {
      newDisplayItemsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      if (newMockupPreviewRef.current) {
        URL.revokeObjectURL(newMockupPreviewRef.current);
      }
    };
  }, []);

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

  const handleSelectDisplayFiles = (e) => {
    setErrorMsg('');
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    if (newDisplayItems.length + files.length > MAX_DISPLAY_FILES_PER_REQUEST) {
      setErrorMsg(
        `Maksimal ${MAX_DISPLAY_FILES_PER_REQUEST} gambar galeri baru dalam satu kali simpan.`
      );
      return;
    }

    const accepted = [];
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
        setErrorMsg(`Format "${file.name}" tidak didukung. Gunakan JPG, PNG, atau WebP.`);
        return;
      }
      if (file.size > MAX_DISPLAY_SIZE_BYTES) {
        setErrorMsg(`Ukuran "${file.name}" melebihi batas maksimal 5 MB.`);
        return;
      }
      accepted.push({
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setNewDisplayItems((prev) => [...prev, ...accepted]);
  };

  const handleRemoveExistingDisplayImage = (imgId) => {
    setExistingDisplayImages((prev) => prev.filter((img) => img.id !== imgId));
    setDeletedDisplayImageIds((prev) => (prev.includes(imgId) ? prev : [...prev, imgId]));
  };

  const handleRemoveNewDisplayItem = (tempId) => {
    setNewDisplayItems((prev) => {
      const target = prev.find((item) => item.id === tempId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== tempId);
    });
  };

  const handleSelectMockupFile = (e) => {
    setErrorMsg('');
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
      setErrorMsg('Format tekstur mockup 3D harus berupa JPG, PNG, atau WebP.');
      return;
    }
    if (file.size > MAX_MOCKUP_SIZE_BYTES) {
      setErrorMsg('Ukuran tekstur mockup 3D maksimal 15 MB.');
      return;
    }

    if (newMockupPreviewUrl) {
      URL.revokeObjectURL(newMockupPreviewUrl);
    }

    setNewMockupFile(file);
    setNewMockupPreviewUrl(URL.createObjectURL(file));
    setRemoveMockup(false);
  };

  const handleRemoveMockup = () => {
    if (newMockupPreviewUrl) {
      URL.revokeObjectURL(newMockupPreviewUrl);
    }
    setNewMockupFile(null);
    setNewMockupPreviewUrl('');
    if (mockupInputRef.current) mockupInputRef.current.value = '';
    if (existingMockup) {
      setRemoveMockup(true);
    }
  };

  const handleRestoreExistingMockup = () => {
    if (newMockupPreviewUrl) {
      URL.revokeObjectURL(newMockupPreviewUrl);
    }
    setNewMockupFile(null);
    setNewMockupPreviewUrl('');
    setRemoveMockup(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setErrorMsg('Nama produk minimal 2 karakter.');
      return;
    }

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setErrorMsg('Harga produk harus berupa angka non-negatif.');
      return;
    }

    const cleanedAttributes = {};
    for (const schema of activeSchemaList) {
      const rawVal = attrValues[schema.name];
      const schemaType = String(schema.type || 'string').toLowerCase();

      if (schemaType === 'boolean') {
        cleanedAttributes[schema.name] = Boolean(rawVal);
        continue;
      }

      const isEmpty = rawVal === undefined || rawVal === null || String(rawVal).trim() === '';
      if (isEmpty) {
        if (schema.required) {
          setErrorMsg(`Atribut "${formatAttributeLabel(schema.name)}" wajib diisi.`);
          return;
        }
        continue;
      }

      if (schemaType === 'number') {
        const numVal = Number(rawVal);
        if (!Number.isFinite(numVal)) {
          setErrorMsg(`Atribut "${formatAttributeLabel(schema.name)}" harus berupa angka.`);
          return;
        }
        cleanedAttributes[schema.name] = numVal;
      } else {
        cleanedAttributes[schema.name] = String(rawVal).trim();
      }
    }

    const displayImageOrders = existingDisplayImages.map((img, idx) => ({
      id: img.id,
      order: idx,
    }));

    setIsSaving(true);
    try {
      await onSaveProduct(
        {
          name: trimmedName,
          category_id: categoryId || undefined,
          price: parsedPrice,
          description: description.trim(),
          additional_attribute: cleanedAttributes,
          active_status: activeStatus,
          product_link: productLink.trim(),
        },
        {
          displayFiles: newDisplayItems.map((item) => item.file),
          deleteDisplayImageIds: deletedDisplayImageIds,
          displayImageOrders,
          mockupFile: newMockupFile,
          removeMockup,
        }
      );
    } catch (err) {
      setErrorMsg(err?.message || 'Gagal menyimpan produk. Silakan periksa kembali data Anda.');
    } finally {
      setIsSaving(false);
    }
  };

  const totalDisplayCount = existingDisplayImages.length + newDisplayItems.length;
  const primaryPreviewUrl =
    existingDisplayImages[0]?.public_url || newDisplayItems[0]?.previewUrl || '';
  const displayedMockupUrl =
    newMockupPreviewUrl || (removeMockup ? '' : existingMockup?.public_url || '');

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
            disabled={isSaving}
            onClick={onClose}
            aria-label="Tutup modal produk"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-50 text-[#F5F1E8] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-md bg-[#9E2A2B]/8 border border-[#9E2A2B]/30 text-[#9E2A2B] text-[13px] font-medium flex items-start gap-2.5 fade-panel"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Pratinjau Visual Motif */}
            <div className="md:col-span-4 space-y-2">
              <span className="text-[13px] font-medium text-[#7C3219] block">
                Pratinjau tampilan katalog
              </span>
              <div className="aspect-[4/3] rounded-md overflow-hidden border border-[#1C1917]/15 bg-[#FCFBF8]">
                <ProductArtwork
                  product={previewProductObj}
                  imageUrl={primaryPreviewUrl}
                  size={320}
                  className="w-full h-full"
                />
              </div>
              <p className="text-[12px] text-[#575049] leading-relaxed">
                Foto galeri pertama akan tampil sebagai sampul utama produk.
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
                  minLength={2}
                  disabled={isSaving}
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
                    disabled={isSaving}
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
                    min="0"
                    step="500"
                    required
                    disabled={isSaving}
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
                  Filosofi &amp; Deskripsi Produk
                </label>
                <textarea
                  id="prod-description"
                  rows={3}
                  disabled={isSaving}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan makna motif, asal inspirasi Trenggalek, atau keunggulan kain..."
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                />
              </div>
            </div>
          </div>

          {/* Atribut Dinamis Sesuai Skema Kategori */}
          {activeSchemaList.length > 0 && (
            <div className="p-4 rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[#7C3219]">
                  Spesifikasi kategori
                </span>
                <span className="text-[12px] text-[#575049]">
                  Tanda * wajib diisi untuk kategori pilihan
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeSchemaList.map((schema) => {
                  const label = formatAttributeLabel(schema.name);
                  const val = attrValues[schema.name];
                  const fieldId = `attr-${schema.name}`;
                  const schemaType = String(schema.type || 'string').toLowerCase();

                  if (schemaType === 'boolean') {
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
                          disabled={isSaving}
                          checked={Boolean(val)}
                          onChange={(e) =>
                            handleAttrChange(schema.name, 'boolean', e.target.checked)
                          }
                          className="w-4 h-4 accent-[#7C3219]"
                        />
                      </label>
                    );
                  }

                  const inputType =
                    schemaType === 'number'
                      ? 'number'
                      : schemaType === 'date'
                      ? 'date'
                      : 'text';

                  return (
                    <div key={schema.id} className="space-y-1">
                      <label
                        htmlFor={fieldId}
                        className="block text-[13px] font-medium text-[#1C1917]"
                      >
                        {label} {schema.required && <span className="text-[#7C3219]">*</span>}
                      </label>
                      <input
                        id={fieldId}
                        type={inputType}
                        required={Boolean(schema.required)}
                        disabled={isSaving}
                        value={val ?? ''}
                        onChange={(e) =>
                          handleAttrChange(schema.name, schemaType, e.target.value)
                        }
                        placeholder={
                          schema.name === 'motif'
                            ? 'Turonggo Yakso / Sekar Jagad'
                            : schema.name === 'teknik' || schema.name === 'teknik_batik'
                            ? 'Tulis / Cap / Kombinasi'
                            : schema.name === 'bahan' || schema.name === 'bahan_kain'
                            ? 'Katun Primisima'
                            : schema.name === 'bentuk'
                            ? 'Kain / Kemeja / Selendang'
                            : schema.name === 'berat_gram'
                            ? '350'
                            : ''
                        }
                        className="w-full min-h-[44px] px-3 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Galeri Foto Produk (Multiple Display Images -> WebP) */}
          <div className="p-4 rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[13px] font-medium text-[#7C3219] block">
                  Galeri foto produk ({totalDisplayCount} foto)
                </span>
                <span className="text-[12px] text-[#575049]">
                  JPG, PNG, atau WebP (maks. 5 MB/file). Otomatis dioptimalkan ke WebP.
                </span>
              </div>

              <label
                className={`taste-btn-primary ${
                  isSaving ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                }`}
              >
                <ImagePlus className="w-4 h-4" />
                <span>Pilih Foto Galeri</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={isSaving}
                  onChange={handleSelectDisplayFiles}
                  className="hidden"
                />
              </label>
            </div>

            {totalDisplayCount > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 pt-1">
                {existingDisplayImages.map((img, idx) => (
                  <div
                    key={img.id}
                    className="relative group aspect-square rounded-md overflow-hidden border border-[#1C1917]/15 bg-[#F7F4EE]"
                  >
                    <img
                      src={img.public_url}
                      alt={`Foto eksisting ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-[#1B1714]/85 text-[#F5F1E8] text-[11px] font-medium tabular-nums">
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleRemoveExistingDisplayImage(img.id)}
                      className="absolute top-1 right-1 p-1.5 rounded bg-[#9E2A2B] text-white opacity-90 hover:opacity-100 disabled:opacity-50 cursor-pointer"
                      aria-label={`Hapus foto ${idx + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {newDisplayItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="relative group aspect-square rounded-md overflow-hidden border-2 border-[#1F5E3B]/50 bg-[#F7F4EE]"
                  >
                    <img
                      src={item.previewUrl}
                      alt={`Foto baru ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-[#1F5E3B]/90 text-white text-[11px] font-medium">
                      Baru
                    </span>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleRemoveNewDisplayItem(item.id)}
                      className="absolute top-1 right-1 p-1.5 rounded bg-[#9E2A2B] text-white opacity-90 hover:opacity-100 disabled:opacity-50 cursor-pointer"
                      aria-label={`Batal unggah foto baru ${idx + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tekstur Mockup 3D (Single Mockup Image -> WebP Lossless) */}
          <div className="p-4 rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-20 h-20 rounded-md border border-[#1C1917]/15 bg-[#EFEAE0] overflow-hidden flex items-center justify-center shrink-0">
              {displayedMockupUrl ? (
                <img
                  src={displayedMockupUrl}
                  alt="Pratinjau tekstur mockup 3D"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Layers className="w-6 h-6 text-[#7C3219]/70" />
              )}
            </div>

            <div className="space-y-2 min-w-0 flex-1">
              <div>
                <span className="text-[13px] font-medium text-[#7C3219] block">
                  Tekstur Mockup 3D (Opsional)
                </span>
                <p className="text-[12px] text-[#575049]">
                  1 gambar pola kain untuk pratinjau baju 3D (JPG/PNG/WebP, maks. 15 MB,
                  disimpan WebP lossless).
                </p>
              </div>

              <input
                ref={mockupInputRef}
                id="prod-mockup-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={isSaving}
                onChange={handleSelectMockupFile}
                className="sr-only"
              />

              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="prod-mockup-upload"
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-md bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/20 text-[13px] font-medium text-[#1C1917] transition-colors ${
                    isSaving ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                  }`}
                >
                  <ImagePlus className="w-3.5 h-3.5 text-[#7C3219]" />
                  <span>{displayedMockupUrl ? 'Ganti Mockup 3D' : 'Pilih Mockup 3D'}</span>
                </label>

                {displayedMockupUrl && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleRemoveMockup}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-md bg-[#FCFBF8] hover:bg-[#9E2A2B]/10 disabled:opacity-50 border border-[#9E2A2B]/30 text-[13px] font-medium text-[#9E2A2B] cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Mockup</span>
                  </button>
                )}

                {removeMockup && existingMockup && !newMockupFile && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleRestoreExistingMockup}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-md bg-[#F7F4EE] hover:bg-[#EFEAE0] disabled:opacity-50 border border-[#1C1917]/15 text-[13px] font-medium text-[#575049] cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Batalkan Hapus</span>
                  </button>
                )}
              </div>

              {newMockupFile && (
                <p className="text-[12px] text-[#1F5E3B] truncate">
                  Mockup siap diunggah: {newMockupFile.name} (
                  {(newMockupFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
              {removeMockup && !newMockupFile && (
                <p className="text-[12px] text-[#9E2A2B]">
                  Mockup 3D saat ini akan dihapus saat perubahan disimpan.
                </p>
              )}
            </div>
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
                  disabled={isSaving}
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
                  disabled={isSaving}
                  checked={activeStatus}
                  onChange={(e) => setActiveStatus(e.target.checked)}
                  className="w-4 h-4 accent-[#7C3219]"
                />
              </label>
            </div>
          </div>

          {/* Tombol Aksi */}
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
                  <span>{initialProduct ? 'Menyimpan...' : 'Mengunggah & Menerbitkan...'}</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{initialProduct ? 'Simpan Perubahan' : 'Terbitkan ke Buku Katalog'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}