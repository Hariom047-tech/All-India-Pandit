import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Icon } from "../../lib/icons";
import { services, serviceName } from "../../data/content";
import { api } from "../../lib/api";
import { useToast } from "./Toast";
import { useLang } from "../../lib/i18n";

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
  const { t } = useLang();

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
      toast(t("enquiry.sentToast"));
    };
    try {
      if (opts?.panditId) await api.panditEnquiry(opts.panditId, payload);
      else if (opts?.templeId) await api.templeInquiry(opts.templeId, payload);
      else
        await api.contact({
          name: payload.name,
          email: `${payload.phone}@enquiry.panditsuggest.in`,
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
        <h3 style={{ fontSize: "1.4rem" }}>{t("enquiry.title")}</h3>
        <p className="muted" style={{ marginTop: 6 }}>
          {opts?.subtitle || t("enquiry.subtitleDefault")}
        </p>
        <form style={{ marginTop: 18 }} onSubmit={onSubmit}>
          <div className="field-group">
            <label className="label" htmlFor="eqName">{t("enquiry.yourName")}</label>
            <input className="input" id="eqName" name="name" required placeholder={t("enquiry.yourNamePlaceholder")} />
          </div>
          <div className="field-group">
            <label className="label" htmlFor="eqPhone">{t("enquiry.phoneNumber")}</label>
            <input className="input" id="eqPhone" name="phone" type="tel" required pattern="[0-9+ ]{10,15}" placeholder="+91 90000 00000" />
          </div>
          <div className="field-group">
            <label className="label" htmlFor="eqSvc">{t("enquiry.selectService")}</label>
            <select className="select" id="eqSvc" name="service" defaultValue={opts?.service || ""}>
              <option value="">{t("enquiry.chooseService")}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label className="label" htmlFor="eqDate">{t("enquiry.preferredDate")}</label>
            <input className="input" id="eqDate" name="date" type="date" />
          </div>
          <div className="field-group">
            <label className="label" htmlFor="eqMsg">{t("enquiry.messageOptional")}</label>
            <textarea className="textarea" id="eqMsg" name="message" style={{ minHeight: 88 }} placeholder={t("enquiry.messagePlaceholder")} />
          </div>
          <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 16 }}>
            <Icon name="send" size={17} /> {t("enquiry.sendInquiry")}
          </button>
          <p className="form-note">{t("enquiry.noCommission")}</p>
        </form>
      </Modal>
    </EnquiryCtx.Provider>
  );
}
