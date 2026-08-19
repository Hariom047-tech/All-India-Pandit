import { useState, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/Auth";
import { useToast } from "../components/ui/Toast";
import { GoogleLogin } from "@react-oauth/google";
import { allCountries } from "../data/countries";
import { AsYouType, isValidPhoneNumber } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";
import { Seo } from "../lib/Seo";

const googleConfigured = Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim());

export default function Login() {
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Country Selector State
  const [showDropdown, setShowDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState({ name: "India", code: "+91", iso: "in" });
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const from = location.state?.from?.pathname || "/dashboard";

  const filteredCountries = allCountries.filter(c => 
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) || 
    c.code.includes(countrySearch)
  );

  // Dynamic max length based on country
  const getMaxLength = () => {
    switch (selectedCountry.iso) {
      case "in": return 10; // India
      case "us": return 10; // USA
      case "ca": return 10; // Canada
      case "gb": return 11; // UK
      case "au": return 9;  // Australia
      case "np": return 10; // Nepal
      case "pk": return 10; // Pakistan
      case "bd": return 10; // Bangladesh
      case "lk": return 9;  // Sri Lanka
      default: return 15;   // Global max
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, ''); // Extract only numbers
    const max = getMaxLength();
    
    // Strictly block typing more digits than allowed
    if (rawDigits.length > max) return;

    const formatter = new AsYouType(selectedCountry.iso.toUpperCase() as CountryCode);
    const formatted = formatter.input(rawDigits);
    setPhone(formatted);
  };

  // OTP 4-Box Logic
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const handleOtpChange = (index: number, val: string) => {
    if (isNaN(Number(val))) return;
    const newOtp = [...otp];
    newOtp[index] = val.slice(-1);
    setOtp(newOtp);

    // Auto-focus next input
    if (val && index < 3) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Determine if current phone is exactly valid for the selected country
  const isPhoneValid = () => {
    try {
      return isValidPhoneNumber(phone, selectedCountry.iso.toUpperCase() as CountryCode);
    } catch {
      return false;
    }
  };

  // E.164-ish: "+91" + digits only — matches what the backend's
  // countryFromPhone()/country_from_phone() and users.phone expect.
  const fullPhone = () => selectedCountry.code + phone.replace(/\D/g, "");

  const handleGetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneValid()) {
      setError("Please enter a valid mobile number for " + selectedCountry.name);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/otp/request", { target: fullPhone(), targetType: "phone" });
      setOtpSent(true);
      toast("OTP sent to " + selectedCountry.code + " " + phone);
    } catch (err: any) {
      setError(err.message || "Could not send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpString = otp.join("");
    if (otpString.length !== 4) {
      setError("Please enter a 4-digit code");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: any }>("/auth/otp/login", {
        phone: fullPhone(),
        otp: otpString,
      });
      login(res.token, res.user);
      toast("Verified successfully!");
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || "Incorrect or expired OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ token: string; user: any }>("/auth/google", { 
        credential: credentialResponse.credential 
      });
      login(res.token, res.user);
      toast("Welcome! Successfully logged in with Google.");
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || "Google Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError("Google Sign-In was cancelled or failed");
  };

  return (
    <>
    <Seo title="Login" path="/login" noindex />
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.5)", // Dark overlay mimicking modal backdrop
      padding: 20
    }}>
      <div style={{ 
        width: "100%", 
        maxWidth: 400, 
        background: "#fff", 
        borderRadius: 12, 
        overflow: "hidden",
        boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
      }}>
        
        {/* Header - Astrotalk Yellow Style */}
        <div style={{ 
          background: "var(--gold)", 
          padding: "16px 20px", 
          display: "flex", 
          justifyContent: "space-between",
          alignItems: "center" 
        }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#000" }}>
            {otpSent ? "Enter OTP" : "Continue with Phone"}
          </h2>
          <button 
            onClick={() => navigate(-1)} 
            style={{ background: "none", border: "none", color: "#000", cursor: "pointer", padding: 4 }}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "30px 24px" }}>
          <p style={{ textAlign: "center", color: "#555", fontSize: "0.95rem", marginBottom: 30, lineHeight: 1.5 }}>
            {otpSent 
              ? `We have sent a 4-digit code to ${selectedCountry.code} ${phone}`
              : "You will receive a 4 digit code for verification"}
          </p>

          {error && (
            <div style={{ padding: "10px", background: "#fef2f2", color: "#991b1b", borderRadius: 8, marginBottom: 20, fontSize: "0.85rem", textAlign: "center" }}>
              {error}
            </div>
          )}

          {!otpSent ? (
            <form onSubmit={handleGetOtp}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#555", marginBottom: 8 }}>
                  Enter your phone number
                </label>
                <div style={{ 
                  display: "flex", 
                  border: "1px solid #ddd", 
                  borderRadius: 8, 
                  background: "#fff",
                  position: "relative"
                }}>
                  {/* Country Code Block */}
                  <div 
                    onClick={() => setShowDropdown(!showDropdown)}
                    style={{ 
                      padding: "12px 14px", 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 6, 
                      borderRight: "1px solid #ddd",
                      fontSize: "0.95rem",
                      color: "#333",
                      cursor: "pointer",
                      whiteSpace: "nowrap", // prevent squishing text
                      userSelect: "none"
                    }}
                  >
                    <img 
                      src={`https://flagcdn.com/w20/${selectedCountry.iso}.png`} 
                      alt={selectedCountry.name} 
                      style={{ width: 20, height: 15, objectFit: "cover", borderRadius: 2 }} 
                    />
                    <span>{selectedCountry.code}</span>
                    <Icon name="chevron-down" size={14} style={{ color: "#888" }} />
                  </div>
                  
                  {/* Dropdown Menu */}
                  {showDropdown && (
                    <div style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      width: "300px",
                      background: "#fff",
                      border: "1px solid #ccc",
                      borderRadius: 8,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      zIndex: 100,
                      marginTop: 4,
                      maxHeight: "260px",
                      display: "flex",
                      flexDirection: "column"
                    }}>
                      <div style={{ padding: "10px" }}>
                        <input 
                          type="text" 
                          placeholder="Search Country..."
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            border: "1px solid #ddd",
                            borderRadius: 6,
                            outline: "none",
                            fontSize: "0.9rem"
                          }}
                          autoFocus
                        />
                      </div>
                      <div style={{ overflowY: "auto", flex: 1 }}>
                        {filteredCountries.map(c => (
                          <div 
                            key={c.code + c.name}
                            onClick={() => { setSelectedCountry(c); setShowDropdown(false); setCountrySearch(""); }}
                            style={{
                              padding: "10px 16px",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              cursor: "pointer",
                              fontSize: "0.9rem",
                              borderBottom: "1px solid #f5f5f5"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#f9f9f9"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            <img 
                              src={`https://flagcdn.com/w20/${c.iso}.png`} 
                              alt={c.name} 
                              style={{ width: 20, height: 15, objectFit: "cover", borderRadius: 2 }} 
                            />
                            <span>{c.code}</span>
                            <span>{c.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Input Block */}
                  <input 
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="Enter mobile no."
                    style={{ 
                      flex: 1, 
                      border: "none", 
                      padding: "12px 16px",
                      fontSize: "1rem",
                      background: "transparent",
                      outline: "none",
                      width: "100%" // prevent shrink issue
                    }}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading || !isPhoneValid()}
                style={{ 
                  width: "100%", 
                  background: (loading || !isPhoneValid()) ? "rgba(212,160,23,0.4)" : "var(--gold)", 
                  color: (loading || !isPhoneValid()) ? "#fff" : "#fff", 
                  border: "none", 
                  padding: "14px", 
                  borderRadius: 8, 
                  fontWeight: 700, 
                  fontSize: "1rem",
                  cursor: (loading || !isPhoneValid()) ? "not-allowed" : "pointer",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 8,
                  transition: "background 0.2s"
                }}
              >
                {loading ? "PLEASE WAIT..." : "GET OTP"} 
                {!loading && <Icon name="arrow-right" size={18} />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <div style={{ marginBottom: 24, display: "flex", justifyContent: "center", gap: 12 }}>
                {otp.map((digit, i) => (
                  <input 
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    style={{ 
                      width: "50px", 
                      height: "56px",
                      border: "1px solid #ddd", 
                      fontSize: "1.5rem",
                      textAlign: "center",
                      borderRadius: 8,
                      outline: "none",
                      boxShadow: digit ? "0 0 0 2px var(--gold)" : "none",
                      transition: "all 0.2s"
                    }}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <button 
                type="submit" 
                disabled={loading || otp.join("").length < 4}
                style={{ 
                  width: "100%", 
                  background: (loading || otp.join("").length < 4) ? "rgba(212,160,23,0.4)" : "var(--gold)", 
                  color: (loading || otp.join("").length < 4) ? "#fff" : "#fff", 
                  border: "none", 
                  padding: "14px", 
                  borderRadius: 8, 
                  fontWeight: 700, 
                  fontSize: "1rem",
                  cursor: (loading || otp.join("").length < 4) ? "not-allowed" : "pointer",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  transition: "background 0.2s"
                }}
              >
                {loading ? "VERIFYING..." : "VERIFY OTP"}
              </button>
              
              <button 
                type="button" 
                onClick={() => setOtpSent(false)}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  color: "#3ba4ff",
                  marginTop: 16,
                  fontSize: "0.9rem",
                  cursor: "pointer"
                }}
              >
                Change Phone Number
              </button>
            </form>
          )}

          {/* Google sign-in needs a real configured OAuth client ID — without
              one, Google itself rejects the request before reaching our
              backend, so the button is hidden rather than offered broken. */}
          {googleConfigured && (
            <>
              {/* OR Divider */}
              <div style={{ display: "flex", alignItems: "center", margin: "24px 0" }}>
                <hr style={{ flex: 1, borderColor: "#eee", margin: 0 }} />
                <span style={{ padding: "0 16px", color: "#aaa", fontSize: "0.85rem", fontWeight: 600 }}>OR</span>
                <hr style={{ flex: 1, borderColor: "#eee", margin: 0 }} />
              </div>

              {/* Google Auth Container */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  useOneTap
                  shape="rectangular"
                  theme="outline"
                  size="large"
                  width="100%"
                  text="signin_with"
                />
              </div>
            </>
          )}

          {/* Footer Terms Text */}
          <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#888", margin: 0, lineHeight: 1.6 }}>
            By Signing up, you agree to our{" "}
            <Link to="/terms" style={{ color: "#3ba4ff", textDecoration: "none" }}>Terms of Use</Link> and{" "}
            <Link to="/privacy" style={{ color: "#3ba4ff", textDecoration: "none" }}>Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
    </>
  );
}
