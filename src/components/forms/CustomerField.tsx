import { useState } from 'react';
import type { Customer } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { uid } from '../../utils/id';
import { Modal } from '../ui/Modal';
import { SelectField, TextField } from './Fields';

export const blankCustomer = (): Customer => ({ id: uid('cust'), name: '', phone: '', email: '', address: '', note: '' });

/** Forma kupca (Novi kupac / Izmena kupca): ista na stranici Kupci i pri ručnom upisu kupca u projektu. */
export function CustomerFormModal({ initial, isNew, onSave, onClose }: { initial: Customer; isNew: boolean; onSave: (c: Customer) => void; onClose: () => void }) {
  const [form, setForm] = useState<Customer>(initial);
  const emailOk = !form.email || /^\S+@\S+\.\S+$/.test(form.email);
  const valid = form.name.trim().length > 0 && emailOk;
  return (
    <Modal title={isNew ? 'Novi kupac' : 'Izmena kupca'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Otkaži</button><button className="btn btn-primary" disabled={!valid} data-testid="customer-save" onClick={() => onSave({ ...form, name: form.name.trim() })}>Sačuvaj</button></>}>
      <TextField label="Ime ili naziv firme" testId="customer-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <TextField label="Telefon" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
      <TextField label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
      {!emailOk && <div role="alert" className="text-xs text-[#b42318] pb-1">Email adresa nije ispravna.</div>}
      <TextField label="Adresa" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
      <TextField label="Napomena" multiline value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
    </Modal>
  );
}

const NEW_CUSTOMER = '__new__';

/**
 * Izbor kupca za projekat: padajući meni sa već upisanim kupcima i opcija „+ Novi kupac (ručni upis)“.
 * Ručno upisan kupac se odmah pravi (stranica Kupci) i postavlja na projekat.
 */
export function CustomerField({ value, onChange, testId }: { value: string | null; onChange: (customerId: string | null) => void; testId?: string }) {
  const customers = useAppStore((s) => s.customers);
  const [adding, setAdding] = useState<Customer | null>(null);
  return (
    <>
      <SelectField label="Kupac" testId={testId} value={value ?? ''}
        options={[{ value: '', label: '— nije izabran —' }, ...customers.map((c) => ({ value: c.id, label: c.name })), { value: NEW_CUSTOMER, label: '+ Novi kupac (ručni upis)…' }]}
        onChange={(v) => { if (v === NEW_CUSTOMER) setAdding(blankCustomer()); else onChange(v || null); }} />
      {adding && (
        <CustomerFormModal initial={adding} isNew onClose={() => setAdding(null)}
          onSave={(c) => { useAppStore.getState().upsertCustomer(c); onChange(c.id); setAdding(null); }} />
      )}
    </>
  );
}
