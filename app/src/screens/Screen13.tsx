import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { HeartIcon, PillIcon, ScrollArea, Tap } from '../ui/kit'
import { DemoBanner, FamilyMembers, HealthCards, HomeHeader, NotificationBanner, HelpLink } from '../ui/homeparts'
import { useNow } from '../ui/useNow'

export default function Screen13() {
  const { go } = useApp()
  const now = useNow()
  const pending = useStore((s) => s.medicines).some((m) => m.status === 'draft' || m.status === 'confirmed')
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <HomeHeader variant="namaste" now={now} />
        <NotificationBanner />
        <DemoBanner />
        <FamilyMembers now={now} />
        <HealthCards now={now} />
        <div style={{ marginTop: 24, background: '#E7EDE2', border: '1px solid #C4D4B8', borderRadius: 18, padding: 24, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#526D51', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><PillIcon size={28} /></div>
          <div className="sf" style={{ fontSize: 20, marginTop: 16 }}>Let's add your medicines</div>
          <div style={{ fontSize: 14, color: '#526D51', marginTop: 8, lineHeight: 1.4 }}>Upload a prescription or add medicines manually so Sathi can remind you.</div>
          <Tap onClick={() => go(pending ? '10' : '30')} style={{ marginTop: 16, height: 48, background: '#526D51', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 500 }}>{pending ? 'Continue setup' : 'Add medicines'}</Tap>
        </div>
        <Tap onClick={() => go('20')} style={{ marginTop: 16, background: '#ECE4EE', border: '1px solid #D8CEDB', borderRadius: 18, padding: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#6F526C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><HeartIcon size={22} /></div>
          <div><div style={{ fontSize: 15, fontWeight: 500 }}>Record a health reading</div><div style={{ fontSize: 13, color: '#6F526C', marginTop: 2 }}>Blood sugar or blood pressure</div></div>
        </Tap>
        <HelpLink />
      </ScrollArea>
      <BottomNav active="home" />
    </div>
  )
}
