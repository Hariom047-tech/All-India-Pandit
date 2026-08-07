import { useLocation } from "react-router-dom";

export default function Legal() {
  const location = useLocation();
  const isPrivacy = location.pathname.includes("privacy");

  return (
    <div style={{ backgroundColor: "#fff", minHeight: "100vh", color: "#333", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 20px" }}>
        
        {isPrivacy ? (
          <>
            <h1 style={{ textAlign: "center", fontSize: "1.5rem", marginBottom: 30, letterSpacing: "1px", color: "#000" }}>PRIVACY POLICY</h1>
            
            <div style={{ fontSize: "0.95rem", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 16 }}>
              <p>
                www.panditsuggest.com ("we", "PanditSuggest", "the Company", hereinafter referred to as "website") is committed to protect the privacy of the users of the website (including third party service providers, hereinafter referred to as 'pandits', and buyers/customers whether registered or not registered). Please read this privacy policy carefully to understand how the website is going to use your information supplied by you to the Website.
              </p>
              
              <p>
                This Privacy Policy is published in accordance with Section 43A of the Information Technology Act, 2000 read with Rule 3(1) of the Information Technology (Intermediaries Guidelines) Rules, 2011, Regulation 4 of the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, and the Digital Personal Data Protection Act, 2023 as applicable, which requires publishing of the Privacy policy for collection, use, storage, management, and transfer of sensitive personal data or information.
              </p>
              
              <p>
                We implement industry-standard security measures adhering to data protection and establishing a privacy policy to ensure the safe collection, use, storage, and transfer of your sensitive personal information. Users have rights to access, correct, or delete their personal data by contacting us, subject to applicable laws.
              </p>
              
              <p>
                PanditSuggest ensures that all advertising and promotional materials for religious and related services strictly adhere to the Advertising Standards Council of India (ASCI) guidelines and Consumer Protection Act, 2019. We provide clear disclaimers in all communications, stating that the religious services and advice provided through the platform are without guaranteed outcomes. PanditSuggest does not guarantee the accuracy of predictions, or the effectiveness of any services and all services are provided with full transparency, in line with the applicable laws.
              </p>

              <h3 style={{ fontSize: "1.1rem", marginTop: 24, marginBottom: 8, color: "#000" }}>USER'S CONSENT</h3>
              <p>
                This Privacy Policy, which may be updated/amended from time to time, deals with the information collected from its users in the form of personal identification, contact details, service preferences and any forecast made using the supplied information and how such information is further used for the purposes of the Website. By accessing the website and using it, you indicate that you understand the terms and expressly consent to the privacy policy of this website. If you do not agree with the terms of this privacy policy, please do not use this website.
              </p>

              <h3 style={{ fontSize: "1.1rem", marginTop: 24, marginBottom: 8, color: "#000" }}>INFORMATION COLLECTED</h3>
              <p>
                When you create an account, we collect your name, phone number, email address, and location data to provide relevant services. We also collect data regarding your usage of the platform to improve our services and AI recommendations. Your contact information is only shared with Pandits when you explicitly choose to contact or book them through our platform.
              </p>

              <h3 style={{ fontSize: "1.1rem", marginTop: 24, marginBottom: 8, color: "#000" }}>GRIEVANCE REDRESSAL</h3>
              <p>
                Any complaints or concerns with regards to content or to report any abuse of laws or breach of these terms may be taken up with the designated Grievance Officer as mentioned below via email to grievance@panditsuggest.com.
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ textAlign: "center", fontSize: "1.5rem", marginBottom: 30, letterSpacing: "1px", color: "#000" }}>TERMS AND CONDITIONS OF USAGE</h1>
            
            <div style={{ fontSize: "0.95rem", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 16 }}>
              <p>
                This website is owned and operated by PanditSuggest ("us" "We", "the Company" or "PanditSuggest" which also includes its affiliates) (contact@panditsuggest.com). The Platform may be provided or be accessible via multiple websites or applications whether owned and/or operated by us or by third parties, including, without limitation, the website panditsuggest.com and its related apps.
              </p>

              <p>
                Following Terms and Conditions (the "Agreement") govern your access and use of our online platform through which consulting, information related to Hindu Rituals, Pujas, Havans, and other allied spiritual services (collectively, the "Spiritual Advisory Services") are administered and accessible to any person.
              </p>

              <p>
                By accessing or using the Platform, you are entering into this Agreement. You should read this Agreement carefully before starting to use the Platform. If you do not agree to be bound to any term of this Agreement, you must not access the Platform.
              </p>

              <p>
                When the terms "we", "us", "our" or similar are used in this Agreement, they refer to any company that owns and operates the Platform (the "Company").
              </p>

              <p style={{ textTransform: "uppercase" }}>
                If you are thinking about harming yourself or others or if you feel that any other person may be in any danger or if you have any medical emergency, you must immediately call the police or a suicide prevention helpline. The platform is not designed for use in any of the aforementioned cases and the service providers cannot provide the assistance required in any of the aforementioned cases. If you proceed to use the platform notwithstanding this notice, you do so entirely at your own risk.
              </p>

              <p style={{ textTransform: "uppercase" }}>
                The platform is not intended for the provision of clinical diagnosis requiring an in-person evaluation. It is also not intended for any information regarding which drugs or medical treatment may be appropriate for you, and you should disregard any such advice if delivered through the platform.
              </p>

              <p style={{ textTransform: "uppercase" }}>
                Do not disregard, avoid, or delay in obtaining in-person care from your doctor or other qualified professional because of information or advice you received through the platform.
              </p>
              
              <h3 style={{ fontSize: "1.1rem", marginTop: 24, marginBottom: 8, color: "#000" }}>ZERO-COMMISSION AND INTERMEDIARY ROLE</h3>
              <p>
                PanditSuggest operates strictly as an online directory and discovery platform. We facilitate the connection between Devotees and Pandits. We do not employ Pandits, nor do we perform, guarantee, or take responsibility for any Pujas, Havans, or religious ceremonies. We operate on a zero-commission model, meaning we do not take a cut from the fees agreed upon between you and the Pandit. All financial transactions occur directly and exclusively between the Devotee and the Pandit.
              </p>

              <h3 style={{ fontSize: "1.1rem", marginTop: 24, marginBottom: 8, color: "#000" }}>LIMITATION OF LIABILITY</h3>
              <p>
                The Platform and its content are provided on an "as is" and "as available" basis. While we strive to verify profiles through our KYC process, PanditSuggest makes no warranties, express or implied, regarding the accuracy, reliability, or spiritual efficacy of the services provided by the Pandits listed on our platform. To the maximum extent permitted by Indian Law, PanditSuggest shall not be liable for any direct, indirect, incidental, consequential, or punitive damages arising out of your use of the Platform or any interactions/transactions between you and any third party found through the Platform.
              </p>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
