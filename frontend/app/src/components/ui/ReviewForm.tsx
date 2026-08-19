import React, { useState } from 'react';
import '../../styles/review-form.css';
import { getToken } from "../../lib/api";

interface ReviewFormProps {
  targetType: 'pandit' | 'temple' | 'platform';
  /** Absent for a platform review — there is no target row. */
  targetSlug?: string;
  targetName?: string;
  services?: { id: string, name: string, slug: string }[];
  onSuccess?: () => void;
}

export function ReviewForm({ targetType, targetSlug, targetName, services = [], onSuccess }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [service, setService] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files).slice(0, 5 - photos.length);
      setPhotos([...photos, ...selected]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return setError('Please select a rating');
    setIsSubmitting(true);
    setError('');

    const formData = new FormData();
    formData.append('targetType', targetType);
    if (targetSlug) formData.append('targetSlug', targetSlug);
    formData.append('rating', rating.toString());
    formData.append('title', title);
    formData.append('body', body);
    if (service) formData.append('service', service);
    photos.forEach(p => formData.append('photos', p));

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken() ?? ''}`
        },
        body: formData
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // The server owns these rules (verification, duplicates, self-review),
        // so show what it actually said rather than a generic failure.
        throw new Error(json?.error || 'Review submit nahi ho paya.');
      }
      setTitle(''); setBody(''); setRating(0); setPhotos([]); setService('');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error submitting review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const heading = targetType === 'platform'
    ? 'Rate PanditSuggest'
    : targetName ? `Review: ${targetName}` : 'Write a Review';

  return (
    <form className="review-form" onSubmit={handleSubmit}>

      {/* ── Fixed header ── */}
      <div className="review-form__header">
        <h3>{heading}</h3>
        <p className="review-form__hint">Aapka naam review ke saath dikhega.</p>
      </div>

      {/* ── Scrollable body ── */}
      <div className="review-form__body">
        {error && <div className="error-message">{error}</div>}

        <div className="rating-selector">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              type="button"
              key={star}
              className={`star ${star <= (hoverRating || rating) ? 'filled' : ''}`}
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
              aria-pressed={rating === star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onFocus={() => setHoverRating(star)}
              onBlur={() => setHoverRating(0)}
            >
              ★
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Review Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
        />

        <textarea
          placeholder="Share your experience..."
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          required
        />

        {services.length > 0 && (
          <select value={service} onChange={e => setService(e.target.value)}>
            <option value="">Select a Service (Optional)</option>
            {services.map(s => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
        )}

        <div className="photo-upload">
          <label>
            <span>📷 Upload Photos (Max 5)</span>
            <input type="file" multiple accept="image/*" onChange={handlePhotoChange} disabled={photos.length >= 5} />
          </label>
          <div className="photo-previews">
            {photos.map((p, i) => (
              <div key={i} className="preview">
                {p.name} <button type="button" onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}>×</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Fixed footer with submit ── */}
      <div className="review-form__footer">
        <button type="submit" className="submit-btn" disabled={isSubmitting || !rating}>
          {isSubmitting ? '⏳ Submitting...' : '✓ Submit Review'}
        </button>
      </div>

    </form>
  );
}
