import { useState } from 'react';
import '../../styles/review-list.css';

interface Review {
  id: number;
  name: string;
  city?: string;
  rating: number;
  title: string;
  text: string;
  service?: string;
  created_at: string;
  photo_urls?: string[];
  video_url?: string;
}

interface ReviewListProps {
  reviews: Review[];
}

export function ReviewList({ reviews }: ReviewListProps) {
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  if (!reviews || reviews.length === 0) {
    return <p className="no-reviews">No reviews yet. Be the first to leave one!</p>;
  }

  return (
    <div className="review-list">
      {reviews.map(review => (
        <div key={review.id} className="review-card">
          <div className="review-header">
            <div className="reviewer-info">
              <h4>{review.name}</h4>
              {review.city && <span className="city">{review.city}</span>}
            </div>
            <div className="stars">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={i < review.rating ? 'filled' : ''}>★</span>
              ))}
            </div>
          </div>
          
          <div className="review-body">
            <h5>{review.title}</h5>
            {review.service && <span className="service-tag">{review.service}</span>}
            <p>{review.text}</p>
          </div>

          {review.photo_urls && review.photo_urls.length > 0 && (
            <div className="review-photos">
              {review.photo_urls.map((url, i) => (
                <img 
                  key={i} 
                  src={`http://localhost:4000${url}`} 
                  alt="Review photo" 
                  onClick={() => setLightboxImg(`http://localhost:4000${url}`)}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {lightboxImg && (
        <div className="review-lightbox" onClick={() => setLightboxImg(null)}>
          <div className="review-lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={lightboxImg} alt="Enlarged review photo" />
            <button className="close-btn" onClick={() => setLightboxImg(null)}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}
