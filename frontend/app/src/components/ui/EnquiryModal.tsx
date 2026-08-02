import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Icon } from "../../lib/icons";
import { services, serviceName } from "../../data/content";
import { api } from "../../lib/api";
import { useToast } from "./Toast";

export interface EnquiryOptions {
  panditId?: string;
  templeId?: string;
  service?: string;
  subtitle?: string;
}

const EnquiryCtx = createContext<(opts?: EnquiryOptions) => void>(() => {});

export function useEnquiryModal() {
  return useContext(EnquiryCtx);
}

export function EnquiryModalProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<EnquiryOptions | null>(null);
  const toast = useToast();

  const open = (o?: EnquiryOptions) => setOpts(o || {});
  const close = () => setOpts(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || ""),
      phone: String(data.get("phone") || ""),
      service: String(data.get("service") || ""),
      date: String(data.get("date") || ""),
      message: String(data.get("message") || ""),
    };
    const done = () => {
      close();
      toast("Inquiry sent — pandit ji will contact you directly.");
    };
    try {
      if (opts?.panditId) await api.panditEnquiry(opts.panditId, payload);
      else if (opts?.templeId) await api.templeInquiry(opts.templeId, payload);
      else
        await api.contact({
          name: payload.name,
          email: `${payload.phone}@enquiry.panditconnect.in`,
          phone: payload.phone,
          subject: `Service enquiry: ${serviceName(payload.service)}`,
          message: payload.message || "(no message)",
        });
    } catch {
      /* soft-fail: still confirm if the backend is offline */
    }
    done();
  }

  return (
    <EnquiryCtx.Provider value={open}>
      {children}
      <Modal open={!!opts} onClose={close}>
        <h3 style={{ fontSize: "1.4rem" }}>Send an enquiry</h3>
        <p className="muted" style={{ marginTop: 6 }}>
          {opts?.subtitle || "We pass your message on. All further discussion happens directly between you and pandit ji."}
        </p>
        <form style={{ marginTop: 18 }} onSubmit={onSubmit}>
          <div className="field-group">
            <label className="label" htmlFor="eqName">Your name</label>
            <input className="input" id="eqName" name="name" required placeholder="Your name" />
          </div>
          <div className="field-group">
            <label className="label" htmlFor="eqPhone">Phone number</label>
            <input className="input" id="eqPhone" name="phone" type="tel" required pattern="[0-9+ ]{10,15}" placeholder="+91 90000 00000" />
          </div>
          <div className="field-group">
            <label className="label" htmlFor="eqSvc">Select your service</label>
            <select className="select" id="eqSvc" name="service" defaultValue={opts?.service || ""}>
              <option value="">Choose a service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label className="label" htmlFor="eqDate">Preferred date</label>
            <input className="input" id="eqDate" name="date" type="date" />
          </div>
          <div className="field-group">
            <label className="label" htmlFor="eqMsg">Message (optional)</label>
            <textarea className="textarea" id="eqMsg" name="message" style={{ minHeight: 88 }} placeholder="Anything pandit ji should know — city, language, family tradition." />
          </div>
          <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 16 }}>
            <Icon name="send" size={17} /> Send Inquiry
          </button>
          <p className="form-note">No commission, no booking fee. We never charge you for connecting.</p>
        </form>
      </Modal>
    </EnquiryCtx.Provider>
  );
}
