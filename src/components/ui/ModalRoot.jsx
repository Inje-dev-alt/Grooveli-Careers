import { useNavigate } from 'react-router-dom';
import { Modal, Button } from './index.js';
import { useUiStore, selectTopModal } from '../../stores/uiStore.js';
import { LocationPanel } from '../locations/LocationPanel.jsx';
import { CompanyList } from '../locations/CompanyList.jsx';
import { CourseList } from '../locations/CourseList.jsx';
import { CityGuide } from '../locations/CityGuide.jsx';
import { JobBrowser } from '../jobs/JobBrowser.jsx';
import { JobDetail } from '../jobs/JobDetail.jsx';
import { MissionBrowser } from '../missions/MissionBrowser.jsx';
import { MissionDetail } from '../missions/MissionDetail.jsx';
import { AICareerCenter } from '../ai/AICareerCenter.jsx';
import { CareerDiscovery } from '../ai/CareerDiscovery.jsx';
import { CareerProfile } from '../profile/CareerProfile.jsx';
import { CareerStats } from '../profile/CareerStats.jsx';
import { CareerDashboard } from '../profile/CareerDashboard.jsx';
import { Achievements } from '../profile/Achievements.jsx';
import { NotificationList } from '../hud/NotificationList.jsx';
import { Leaderboard } from '../leaderboard/Leaderboard.jsx';
import { HiringAnalytics } from '../employer/HiringAnalytics.jsx';
import { useChatStore } from '../../stores/chatStore.js';
import { resolveAnyPlace } from '../../game/world/places.js';
import { OfficeReception } from '../locations/OfficeReception.jsx';
import { OfficeNotices } from '../locations/OfficeNotices.jsx';
import { RoomRoster } from '../locations/RoomRoster.jsx';
import { ConversationList } from '../chat/ConversationList.jsx';
import { ChatPanel } from '../chat/ChatPanel.jsx';

/**
 * Renders whichever panel is on top of the modal stack.
 *
 * Only the top layer is mounted: a stack of translucent backdrops would be
 * unreadable, and the panels below are cheap to re-mount when the stack
 * unwinds. Every panel in the product routes through here, which is what keeps
 * "open a panel" a one-line call from anywhere.
 */
export function ModalRoot() {
  const topModal = useUiStore(selectTopModal);
  if (!topModal) return null;
  return <ModalLayer key={topModal.id} modal={topModal} />;
}

function ModalLayer({ modal }) {
  const navigate = useNavigate();
  const closeModal = useUiStore((s) => s.closeModal);
  const openModal = useUiStore((s) => s.openModal);
  const closeAllModals = useUiStore((s) => s.closeAllModals);
  const { type, props } = modal;

  const goTo = (route) => {
    closeAllModals();
    navigate(route);
  };

  switch (type) {
    case 'location': {
      // Every room's lookup, from the one registry in world/places.js. A
      // hand-written chain here is how the company office ended up with a
      // prompt that opened nothing.
      const location = resolveAnyPlace(props.locationId);
      if (!location) return null;
      return <LocationPanel location={location} />;
    }

    case 'jobs':
      return (
        <Modal
          eyebrow={props.title ?? 'Grooveli'}
          title="Job Marketplace"
          subtitle="The same roles the city shows, searchable."
          size="lg"
          onClose={closeModal}
        >
          <JobBrowser
            districtId={props.districtId}
            organizationId={props.organizationId}
            onOpenJob={(job) => openModal('job-detail', { job })}
            compactFilters
          />
        </Modal>
      );

    case 'job-detail':
      return (
        <Modal
          eyebrow={props.job.companyName}
          title={props.job.title}
          size="lg"
          onClose={closeModal}
        >
          <JobDetail job={props.job} onBack={closeModal} />
        </Modal>
      );

    case 'missions':
      return (
        <Modal
          eyebrow={props.title ?? 'Grooveli'}
          title="Missions"
          subtitle="Career activity, structured."
          size="lg"
          onClose={closeModal}
        >
          <MissionBrowser
            locationId={props.locationId}
            onOpenMission={(mission) => openModal('mission-detail', { mission })}
          />
        </Modal>
      );

    case 'mission-detail':
      return (
        <Modal
          eyebrow={`${props.mission.type} mission`}
          title={props.mission.title}
          size="md"
          onClose={closeModal}
        >
          <MissionDetail mission={props.mission} onNavigate={goTo} />
        </Modal>
      );

    case 'ai':
      return (
        <Modal
          eyebrow="Grooveli AI"
          title="AI Career Center"
          size="lg"
          onClose={closeModal}
        >
          <div style={{ minHeight: '46vh', display: 'flex' }}>
            <AICareerCenter initialIntent={props.initialIntent} embedded />
          </div>
        </Modal>
      );

    case 'career-discovery':
      return (
        <Modal
          eyebrow="Grooveli AI"
          title="Career Discovery"
          subtitle="Career paths your skills point at, and what stands between you and each one."
          size="md"
          onClose={closeModal}
        >
          <CareerDiscovery
            onExplore={(match) => {
              closeAllModals();
              navigate(`/jobs?search=${encodeURIComponent(match.title)}`);
            }}
          />
        </Modal>
      );

    case 'companies':
      return (
        <Modal
          eyebrow={props.title ?? 'Grooveli City'}
          title="Employers"
          subtitle="Company profiles and open positions."
          size="lg"
          onClose={closeModal}
        >
          <CompanyList
            districtId={props.districtId}
            onViewJobs={(company) =>
              openModal('jobs', { districtId: company.districtId, title: company.name })
            }
          />
        </Modal>
      );

    case 'courses':
      return (
        <Modal
          eyebrow="Training Center"
          title="Courses & Certifications"
          subtitle="Accredited short courses. Each completion is worth 200 XP and a certification."
          size="lg"
          onClose={closeModal}
        >
          <CourseList />
        </Modal>
      );

    case 'city-guide':
      return (
        <Modal eyebrow="Grooveli City" title="City Guide" size="md" onClose={closeModal}>
          <CityGuide onClose={closeModal} />
        </Modal>
      );

    case 'career-dashboard':
      return (
        <Modal eyebrow="Your desk" title="Career Dashboard" size="lg" onClose={closeModal}>
          <CareerDashboard />
        </Modal>
      );

    case 'career-stats':
      return (
        <Modal eyebrow="Career wall" title="Career Statistics" size="md" onClose={closeModal}>
          <CareerStats />
        </Modal>
      );

    case 'achievements':
      return (
        <Modal eyebrow="Trophy shelf" title="Achievements" size="md" onClose={closeModal}>
          <Achievements />
        </Modal>
      );

    case 'profile':
      return (
        <Modal
          eyebrow="CV folder"
          title="Career Profile"
          size="xl"
          onClose={closeModal}
          footer={
            <Button variant="ghost" onClick={() => goTo('/profile')}>
              Open full profile
            </Button>
          }
        >
          <CareerProfile compact />
        </Modal>
      );

    case 'leaderboard':
      return (
        <Modal
          eyebrow="Plaza board"
          title="City Standings"
          subtitle="Ranked by reputation - what employers can verify, not what people post."
          size="md"
          onClose={closeModal}
        >
          <Leaderboard />
        </Modal>
      );

    case 'notifications':
      return (
        <Modal eyebrow="Phone" title="Notifications" size="md" onClose={closeModal}>
          <NotificationList />
        </Modal>
      );

    case 'office-profile':
      return (
        <Modal
          eyebrow="Reception"
          title="About this company"
          subtitle="What a candidate reads before applying."
          size="md"
          onClose={closeModal}
        >
          <OfficeReception />
        </Modal>
      );

    case 'office-posts':
      return (
        <Modal
          eyebrow="Notice board"
          title="From this company"
          subtitle="What they have shared with the network."
          size="md"
          onClose={closeModal}
        >
          <OfficeNotices />
        </Modal>
      );

    case 'room-roster':
      return (
        <Modal
          eyebrow={props.eyebrow ?? 'Around you'}
          title="Who else is here"
          subtitle="Presence updates every few seconds."
          size="md"
          onClose={closeModal}
        >
          <RoomRoster />
        </Modal>
      );

    /*
     * One modal for both the inbox and a thread, swapping between them in
     * place. Which one shows is decided by the chat store rather than by a
     * second modal layer: a thread pushed on top of the inbox would stack two
     * translucent backdrops, which this stack deliberately never does, and
     * would leave the store and the stack as two places that each think they
     * know which conversation is open.
     */
    case 'messages':
      return <MessagesModal onClose={closeModal} />;

    case 'company-analytics':
      return (
        <Modal
          eyebrow="Hiring board"
          title="Hiring Analytics"
          subtitle="Your pipeline as numbers."
          size="md"
          onClose={closeModal}
          footer={
            <Button variant="ghost" onClick={() => goTo('/employer/candidates')}>
              Review candidates
            </Button>
          }
        >
          <HiringAnalytics />
        </Modal>
      );

    default:
      return null;
  }
}

/**
 * Messages: the inbox, or the thread that is open.
 *
 * Its own component because it needs the chat store, and `ModalLayer` is a
 * switch over every panel in the product — subscribing it to one panel's
 * store would re-render all of them on every incoming message.
 */
function MessagesModal({ onClose }) {
  const openId = useChatStore((s) => s.openId);
  const open = useChatStore((s) => s.open);
  const close = useChatStore((s) => s.close);

  return (
    <Modal
      eyebrow="Grooveli"
      title={openId ? 'Conversation' : 'Messages'}
      subtitle={openId ? undefined : 'People you have met in the city.'}
      size="md"
      onClose={onClose}
    >
      {openId ? (
        <ChatPanel onBack={close} />
      ) : (
        <ConversationList onOpen={open} />
      )}
    </Modal>
  );
}
