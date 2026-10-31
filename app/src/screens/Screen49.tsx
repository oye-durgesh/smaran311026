import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { addPerson, restorePerson, setActivePerson, updateProfile } from '../store/actions'
import { useStore } from '../store/store'
import { BackBtn, Btn, CheckIcon, Err, InputBox, ScrollArea, StepRing, Tap, TextInput } from '../ui/kit'
import { personLabel, relationshipName } from '../domain/people'
import type { Person } from '../domain/types'

type Choice = 'mother' | 'father' | 'other'
const CHOICES: Array<[Choice, string, string]> = [['mother', 'Mummy', 'Set up reminders for your mother'], ['father', 'Papa', 'Set up reminders for your father'], ['other', 'Someone else', 'Dadi, Dada, or another relative']]

/** Choose or add the parent you are helping. Used in onboarding ("Helping a parent") and later from Family members (param "add"). */
export default function Screen49({ param }: { param?: string }) {
  const { go, back, home, toast } = useApp()
  const adding = param === 'add'
  const people = useStore((s) => s.people)
  const parents = people.filter((p) => p.relationship !== 'self' && !p.archived)
  const archived = people.filter((p) => p.relationship !== 'self' && p.archived)
  const [choice, setChoice] = useState<Choice | null>(parents.length === 0 ? 'mother' : null)
  const [label, setLabel] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string>()

  const finish = (p: Person) => {
    setActivePerson(p.id)
    if (adding) { toast(`${personLabel(p)} is ready.`, 'success'); go('50', p.id); return }
    updateProfile({ onboarded: true, signedIn: true })
    go('06')
  }
  const submit = () => {
    if (!choice) { setErr('Choose who you are helping, or pick a parent below.'); return }
    const r = addPerson({ relationship: choice, relationshipLabel: label, displayName: name })
    if (!r.ok) { setErr(r.error); return }
    finish(r.value.person)
  }
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackBtn onClick={back} />
          {!adding && <StepRing step={4} total={5} />}
        </div>
        <div className="sf" style={{ fontSize: 24, marginTop: 20, lineHeight: 1.25 }}>{adding ? 'Add a family member' : 'Who are you helping?'}</div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>Each person keeps their own medicines, reminders and health records.</div>

        {parents.length > 0 && (
          <>
            <div className="lbl">ALREADY ADDED</div>
            <div role="radiogroup" aria-label="Added family members" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {parents.map((p) => (
                <Tap key={p.id} role="radio" aria-checked={false} onClick={() => finish(p)} label={`Continue with ${personLabel(p)}`}
                  style={{ background: '#F8F4EC', border: '1px solid #E8DFD1', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{personLabel(p)}</div><div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 2 }}>{relationshipName(p)}</div></div>
                </Tap>
              ))}
            </div>
          </>
        )}

        <div className="lbl">{parents.length > 0 ? 'OR ADD SOMEONE' : 'WHO IS THIS?'}</div>
        <div role="radiogroup" aria-label="Relationship" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {CHOICES.map(([val, title, sub]) => {
            const on = choice === val
            const taken = val !== 'other' && parents.some((p) => p.relationship === val)
            return (
              <Tap key={val} role="radio" aria-checked={on} disabled={taken} onClick={() => { setChoice(val); setErr(undefined) }}
                style={{ background: '#F8F4EC', border: on ? '1.5px solid #7B8B5A' : '1px solid #E8DFD1', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: taken ? 0.5 : 1 }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div><div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 2 }}>{taken ? 'Already added' : sub}</div></div>
                {on ? <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#7B8B5A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckIcon size={10} color="#fff" w={3} /></span>
                  : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px solid #8A7F6A' }} />}
              </Tap>
            )
          })}
        </div>
        {choice === 'other' && (
          <>
            <label className="lbl" htmlFor="fp-rel" style={{ display: 'block' }}>RELATIONSHIP</label>
            <InputBox style={{ marginTop: 10 }}><TextInput id="fp-rel" maxLength={40} placeholder="For example, Dadi" value={label} onChange={(e) => { setLabel(e.target.value); setErr(undefined) }} /></InputBox>
          </>
        )}
        {choice && (
          <>
            <label className="lbl" htmlFor="fp-name" style={{ display: 'block' }}>THEIR NAME (OPTIONAL)</label>
            <InputBox style={{ marginTop: 10 }}><TextInput id="fp-name" maxLength={80} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} /></InputBox>
          </>
        )}
        <Err>{err}</Err>
        {archived.length > 0 && (
          <>
            <div className="lbl">ARCHIVED</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {archived.map((p) => (
                <Tap key={p.id} onClick={() => { restorePerson(p.id); toast(`${personLabel(p)} restored.`, 'success') }} label={`Restore ${personLabel(p)}`}
                  style={{ background: '#fff', border: '1px dashed #C4BAA8', borderRadius: 14, padding: '12px 16px', fontSize: 14 }}>Restore {personLabel(p)}</Tap>
              ))}
            </div>
          </>
        )}
        {!adding && <Tap style={{ marginTop: 16, fontSize: 13, color: '#7A6B5D', textAlign: 'center' }} onClick={() => { updateProfile({ onboarded: true, signedIn: true }); home() }}>Skip for now</Tap>}
      </ScrollArea>
      <div className="ft"><Btn onClick={submit} disabled={!choice}>Continue</Btn></div>
    </div>
  )
}
