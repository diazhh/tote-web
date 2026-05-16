'use client';

import { useRef, useState } from 'react';

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function AttachmentPicker({ value, onChange, disabled }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  function handle(file) {
    setError('');
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('Archivo excede 5MB');
      return;
    }
    if (file.type && !ALLOWED_MIMES.includes(file.type)) {
      setError('Tipo no permitido (PDF, JPG, PNG)');
      return;
    }
    onChange(file);
    if (file.type?.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }

  function clear() {
    onChange(null);
    setPreview(null);
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
        disabled={disabled}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
        disabled={disabled}
      />
      {!value && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={disabled}
            className="min-h-11 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50">
            📷 Tomar foto
          </button>
          <button type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="min-h-11 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50">
            📁 Elegir archivo
          </button>
        </div>
      )}
      {value && (
        <div className="flex items-center gap-3 border border-gray-200 rounded-md p-2">
          {preview ? (
            <img src={preview} alt="vista previa" className="w-16 h-16 object-cover rounded" />
          ) : (
            <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-2xl">📄</div>
          )}
          <div className="flex-1 text-sm">
            <div className="font-medium text-gray-900 truncate">{value.name}</div>
            <div className="text-xs text-gray-500">{(value.size / 1024).toFixed(1)} KB</div>
          </div>
          <button type="button" onClick={clear}
            className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700">
            Quitar
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
