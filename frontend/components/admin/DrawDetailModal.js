'use client';

import { useEffect, useState } from 'react';
import drawsAPI from '@/lib/api/draws';
import { toast } from 'sonner';
import { X, Image as ImageIcon, Send, CheckCircle, XCircle, Clock, RefreshCw, Sparkles, Play, Target, Download, Edit } from 'lucide-react';
import { formatCaracasTime, formatCaracasDateTime } from '@/lib/utils/dateUtils';

export default function DrawDetailModal({ draw, onClose, onUpdate }) {
  const [drawData, setDrawData] = useState(draw);
  const [loading, setLoading] = useState(false);
  const [republishing, setRepublishing] = useState({});
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageExists, setImageExists] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [preselecting, setPreselecting] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageRetryCount, setImageRetryCount] = useState(0);
  const [imageBlobUrl, setImageBlobUrl] = useState(null);

  useEffect(() => {
    if (draw) {
      loadDrawDetails();
    }
  }, [draw]);

  useEffect(() => {
    // Load image as blob to bypass browser cache
    if (drawData?.imageUrl && (drawData.imageGenerated || imageExists)) {
      loadImageAsBlob();
    }
  }, [drawData?.imageUrl, drawData?.imageGenerated, imageExists, imageRetryCount]);

  useEffect(() => {
    // Cleanup blob URL on unmount
    return () => {
      if (imageBlobUrl) {
        URL.revokeObjectURL(imageBlobUrl);
      }
    };
  }, [imageBlobUrl]);

  const loadDrawDetails = async () => {
    try {
      const response = await drawsAPI.getById(draw.id);
      setDrawData(response.data || draw);
      
      // Check if image exists
      if (response.data?.result) {
        checkImageExists();
      }
    } catch (error) {
      console.error('Error loading draw details:', error);
    }
  };

  const loadImageAsBlob = async () => {
    if (!drawData?.imageUrl) return;
    
    try {
      const imageUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${drawData.imageUrl}`;
      const response = await fetch(imageUrl, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error('Image not found');
      }
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // Clean up old blob URL
      if (imageBlobUrl) {
        URL.revokeObjectURL(imageBlobUrl);
      }
      
      setImageBlobUrl(blobUrl);
      setImageLoadError(false);
    } catch (error) {
      console.error('Error loading image as blob:', error);
      setImageLoadError(true);
      setImageBlobUrl(null);
    }
  };

  const checkImageExists = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/images/check/${draw.id}`,
        {
          credentials: 'include',
          cache: 'no-cache', // Force fresh request
        }
      );
      const data = await response.json();
      const exists = data.data?.exists || false;
      setImageExists(exists);
      
      // If image exists, reset error state
      if (exists) {
        setImageLoadError(false);
      }
    } catch (error) {
      console.error('Error checking image:', error);
      setImageExists(false);
    }
  };

  const handleGenerateImage = async () => {
    setGeneratingImage(true);
    setImageLoadError(false);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

      if (!token) {
        throw new Error('No hay token de autenticación');
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/images/generate/${draw.id}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al generar imagen');
      }
      
      const data = await response.json();
      toast.success('Imagen generada exitosamente');
      
      // Reload draw details to get the new image URL
      await loadDrawDetails();
      setImageExists(true);
    } catch (error) {
      console.error('Error generating image:', error);
      toast.error(error.message || 'Error al generar la imagen');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleRegenerateImage = async () => {
    setGeneratingImage(true);
    setImageLoadError(false);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

      if (!token) {
        throw new Error('No hay token de autenticación');
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/images/regenerate/${draw.id}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al regenerar imagen');
      }
      
      const data = await response.json();
      toast.success('Imagen regenerada exitosamente');
      
      // Reload draw details to get the new image URL
      await loadDrawDetails();
      setImageExists(true);
      setImageRetryCount(prev => prev + 1);
    } catch (error) {
      console.error('Error regenerating image:', error);
      toast.error(error.message || 'Error al regenerar la imagen');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleRetryImageLoad = async () => {
    setImageLoadError(false);
    setImageRetryCount(prev => prev + 1);
    
    // Wait a bit before checking to allow the new image to load
    setTimeout(() => {
      checkImageExists();
    }, 500);
  };

  const handleRepublish = async (channel) => {
    setRepublishing(prev => ({ ...prev, [channel]: true }));
    try {
      // This endpoint needs to be created in the backend
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/draws/${draw.id}/republish/${channel}`, {
        method: 'POST',
        credentials: 'include',
      });
      toast.success(`Reenviando a ${channel}...`);
      loadDrawDetails();
    } catch (error) {
      toast.error(`Error al reenviar a ${channel}`);
    } finally {
      setRepublishing(prev => ({ ...prev, [channel]: false }));
    }
  };

  const handlePreselectWinner = async () => {
    if (!selectedItemId) {
      toast.error('Por favor selecciona un número');
      return;
    }
    
    setPreselecting(true);
    try {
      const response = await drawsAPI.preselect(draw.id, selectedItemId);
      if (response.success) {
        toast.success('Ganador preseleccionado exitosamente');
        await loadDrawDetails();
        if (onUpdate) onUpdate();
      }
    } catch (error) {
      console.error('Error preselecting winner:', error);
      toast.error('Error al preseleccionar ganador');
    } finally {
      setPreselecting(false);
    }
  };

  const handleExecuteDraw = async () => {
    if (!drawData.preselectedItemId && !selectedItemId) {
      toast.error('Debes preseleccionar un ganador primero');
      return;
    }

    setExecuting(true);
    try {
      // If there's a selected item but not preselected, preselect first
      if (selectedItemId && !drawData.preselectedItemId) {
        await drawsAPI.preselect(draw.id, selectedItemId);
      }

      // Execute the draw
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/draws/${draw.id}/execute`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ winnerItemId: selectedItemId || drawData.preselectedItemId })
        }
      );

      if (!response.ok) {
        throw new Error('Error al ejecutar sorteo');
      }

      const data = await response.json();
      toast.success('Sorteo ejecutado y totalizado exitosamente');
      await loadDrawDetails();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error executing draw:', error);
      toast.error('Error al ejecutar el sorteo');
    } finally {
      setExecuting(false);
    }
  };

  // Removed formatTimeAMPM and formatDateTimeAMPM - using dateUtils instead

  const handleDownloadImage = async () => {
    if (!drawData.imageUrl) return;
    
    try {
      const imageUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${drawData.imageUrl}`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `sorteo_${drawData.game?.name}_${new Date(drawData.scheduledAt).toISOString().split('T')[0]}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      toast.success('Imagen descargada');
    } catch (error) {
      console.error('Error downloading image:', error);
      toast.error('Error al descargar la imagen');
    }
  };

  const handleChangePreselected = async () => {
    if (!selectedItemId) {
      toast.error('Por favor selecciona un número');
      return;
    }
    
    setPreselecting(true);
    try {
      const response = await drawsAPI.changeWinner(draw.id, selectedItemId);
      if (response.success) {
        toast.success('Preselección actualizada exitosamente');
        await loadDrawDetails();
        if (onUpdate) onUpdate();
      }
    } catch (error) {
      console.error('Error changing preselected:', error);
      toast.error('Error al cambiar preselección');
    } finally {
      setPreselecting(false);
    }
  };

  const getPublicationStatus = (status) => {
    switch (status) {
      case 'SENT':
        return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'Enviado' };
      case 'FAILED':
        return { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Fallido' };
      case 'PENDING':
        return { icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Pendiente' };
      default:
        return { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100', label: status };
    }
  };

  const isOverdue = drawData.status === 'SCHEDULED' && new Date(drawData.scheduledAt) < new Date();
  const canPreselect = drawData.status === 'SCHEDULED';
  const canChangePreselected = drawData.status !== 'DRAWN' && drawData.status !== 'PUBLISHED';
  const canExecute = (drawData.status === 'SCHEDULED' && isOverdue) || drawData.status === 'CLOSED';

  if (!drawData) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Detalles del Sorteo
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {drawData.game?.name} - {formatDateTimeAMPM(drawData.scheduledAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Preselect/Execute Section */}
          {(canPreselect || canExecute) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-3 flex items-center">
                <Target className="w-4 h-4 mr-2" />
                {canExecute ? 'Ejecutar Sorteo' : 'Preseleccionar Ganador'}
              </h3>
              
              {drawData.game?.items && (
                <div className="space-y-3">
                  <select
                    value={selectedItemId || drawData.preselectedItemId || ''}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    disabled={drawData.preselectedItemId && !canExecute}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100"
                  >
                    <option value="">Seleccionar número...</option>
                    {drawData.game.items.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.number} - {item.name}
                      </option>
                    ))}
                  </select>
                  
                  <div className="flex space-x-2">
                    {canPreselect && !drawData.preselectedItemId && (
                      <button
                        onClick={handlePreselectWinner}
                        disabled={preselecting || !selectedItemId}
                        className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Target className={`w-4 h-4 mr-2 ${preselecting ? 'animate-pulse' : ''}`} />
                        {preselecting ? 'Preseleccionando...' : 'Preseleccionar'}
                      </button>
                    )}
                    
                    {canExecute && (
                      <button
                        onClick={handleExecuteDraw}
                        disabled={executing || (!drawData.preselectedItemId && !selectedItemId)}
                        className="flex-1 flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Play className={`w-4 h-4 mr-2 ${executing ? 'animate-pulse' : ''}`} />
                        {executing ? 'Ejecutando...' : 'Ejecutar y Totalizar'}
                      </button>
                    )}
                  </div>
                  
                  {isOverdue && (
                    <p className="text-xs text-orange-600">
                      ⚠️ Este sorteo está vencido. Puedes preseleccionar el ganador y ejecutarlo.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Status and Winner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Estado del Sorteo</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Estado:</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    drawData.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                    drawData.status === 'DRAWN' ? 'bg-purple-100 text-purple-800' :
                    drawData.status === 'CLOSED' ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {drawData.status}
                  </span>
                </div>
                {drawData.closedAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Cerrado:</span>
                    <span className="text-gray-900">
                      {formatCaracasTime(drawData.closedAt)}
                    </span>
                  </div>
                )}
                {drawData.drawnAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Sorteado:</span>
                    <span className="text-gray-900">
                      {formatCaracasTime(drawData.drawnAt)}
                    </span>
                  </div>
                )}
                {drawData.publishedAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Publicado:</span>
                    <span className="text-gray-900">
                      {formatCaracasTime(drawData.publishedAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Resultado</h3>
              {drawData.winnerItem ? (
                <div className="text-center">
                  <div className="text-4xl font-bold text-blue-600 mb-2">
                    {drawData.winnerItem.number}
                  </div>
                  <div className="text-lg text-gray-900">
                    {drawData.winnerItem.name}
                  </div>
                  {drawData.preselectedItem && (
                    <div className="mt-2 text-xs text-orange-600">
                      (Preseleccionado)
                    </div>
                  )}
                </div>
              ) : drawData.preselectedItem ? (
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600 mb-2">
                    {drawData.preselectedItem.number}
                  </div>
                  <div className="text-sm text-gray-600">
                    Preseleccionado - Pendiente de sorteo
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  Sin resultado aún
                </div>
              )}
            </div>
          </div>

          {/* Change Preselected - Only if not DRAWN or PUBLISHED */}
          {drawData.preselectedItemId && canChangePreselected && drawData.game?.items && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-orange-900 mb-3 flex items-center">
                <Edit className="w-4 h-4 mr-2" />
                Cambiar Preselección
              </h3>
              
              <div className="space-y-3">
                <div className="text-sm text-orange-700 mb-2">
                  Actual: <span className="font-semibold">{drawData.preselectedItem?.number} - {drawData.preselectedItem?.name}</span>
                </div>
                
                <select
                  value={selectedItemId || ''}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                >
                  <option value="">Seleccionar nuevo número...</option>
                  {drawData.game.items.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.number} - {item.name}
                    </option>
                  ))}
                </select>
                
                <button
                  onClick={handleChangePreselected}
                  disabled={preselecting || !selectedItemId}
                  className="w-full flex items-center justify-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Edit className={`w-4 h-4 mr-2 ${preselecting ? 'animate-pulse' : ''}`} />
                  {preselecting ? 'Cambiando...' : 'Cambiar Preselección'}
                </button>
              </div>
            </div>
          )}

          {/* Image - Similar to Publications */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
              <ImageIcon className="w-4 h-4 mr-2" />
              Imagen del Resultado
            </h3>
            
            {drawData.winnerItem ? (
              <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                <div className="flex items-center space-x-3">
                  {drawData.imageUrl && (drawData.imageGenerated || imageExists) && !imageLoadError && imageBlobUrl ? (
                    <>
                      <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          key={`image-${imageRetryCount}`}
                          src={imageBlobUrl}
                          alt="Miniatura"
                          className="w-full h-full object-cover"
                          onError={() => {
                            console.error('Image load error:', drawData.imageUrl);
                            setImageLoadError(true);
                          }}
                          onLoad={() => setImageLoadError(false)}
                        />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 flex items-center">
                          <CheckCircle className="w-4 h-4 text-green-600 mr-1" />
                          Imagen Generada
                        </div>
                        {drawData.imageGeneratedAt && (
                          <div className="text-xs text-gray-500">
                            {formatDateTimeAMPM(drawData.imageGeneratedAt)}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                        <XCircle className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {imageLoadError ? 'Error al cargar imagen' : 'Sin Imagen'}
                        </div>
                        <div className="text-sm text-gray-600">
                          {imageLoadError ? 'Archivo no encontrado' : 'No generada'}
                        </div>
                        {drawData.imageError && (
                          <div className="text-xs text-red-600 mt-1">
                            Error: {drawData.imageError}
                          </div>
                        )}
                        {imageLoadError && drawData.imageUrl && (
                          <div className="text-xs text-gray-500 mt-1">
                            URL: {drawData.imageUrl}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                
                <div className="flex space-x-2">
                  {drawData.imageUrl && (drawData.imageGenerated || imageExists) ? (
                    <>
                      {!imageLoadError && (
                        <button
                          onClick={handleDownloadImage}
                          className="flex items-center px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                          title="Descargar imagen"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Descargar
                        </button>
                      )}
                      {imageLoadError && (
                        <button
                          onClick={handleRetryImageLoad}
                          className="flex items-center px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
                          title="Reintentar cargar imagen"
                        >
                          <RefreshCw className="w-4 h-4 mr-1" />
                          Reintentar
                        </button>
                      )}
                      <button
                        onClick={handleRegenerateImage}
                        disabled={generatingImage}
                        className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                        title="Regenerar imagen"
                      >
                        <RefreshCw className={`w-4 h-4 mr-1 ${generatingImage ? 'animate-spin' : ''}`} />
                        Regenerar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleGenerateImage}
                      disabled={generatingImage}
                      className="flex items-center px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                      title="Generar imagen"
                    >
                      <Sparkles className={`w-4 h-4 mr-1 ${generatingImage ? 'animate-pulse' : ''}`} />
                      {generatingImage ? 'Generando...' : 'Generar'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm">El sorteo debe tener un ganador para generar la imagen</p>
              </div>
            )}
          </div>

          {/* Publications */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
              <Send className="w-4 h-4 mr-2" />
              Estado de Publicaciones
            </h3>
            
            {drawData.publications && drawData.publications.length > 0 ? (
              <div className="space-y-3">
                {drawData.publications.map((pub) => {
                  const statusInfo = getPublicationStatus(pub.status);
                  const StatusIcon = statusInfo.icon;
                  
                  return (
                    <div
                      key={pub.id}
                      className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 ${statusInfo.bg} rounded-lg flex items-center justify-center`}>
                          <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{pub.channel}</div>
                          <div className="text-sm text-gray-600">{statusInfo.label}</div>
                          {pub.sentAt && (
                            <div className="text-xs text-gray-500">
                              {formatDateTimeAMPM(pub.sentAt)}
                            </div>
                          )}
                          {pub.error && (
                            <div className="text-xs text-red-600 mt-1">
                              Error: {pub.error}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {(pub.status === 'FAILED' || pub.status === 'PENDING') && (
                        <button
                          onClick={() => handleRepublish(pub.channel)}
                          disabled={republishing[pub.channel]}
                          className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 mr-1 ${republishing[pub.channel] ? 'animate-spin' : ''}`} />
                          Reenviar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No hay publicaciones registradas
              </div>
            )}
          </div>

          {/* Notes */}
          {drawData.notes && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Notas</h3>
              <p className="text-sm text-gray-600">{drawData.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
