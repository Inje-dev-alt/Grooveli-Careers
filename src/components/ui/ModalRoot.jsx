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
import { CareerProfile } from '../profile/CareerProfile.jsx';
import { CareerStats } from '../profile/CareerStats.jsx';
import { CareerDashboard } from '../profile/CareerDashboard.jsx';
import { Achievements } from '../profile/Achievements.jsx';
import { NotificationList } from '../hud/NotificationList.jsx';
import { getLocation } from '../../game/world/locations.js';
import { getApartmentObject } from '../../game/world/apartment.js';

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
      const location =
        getLocation(props.locationId) ?? getApartmentObject(props.locationId) ?? null;
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

    case 'notifications':
      return (
        <Modal eyebrow="Phone" title="Notifications" size="md" onClose={closeModal}>
          <NotificationList />
        </Modal>
      );

    default:
      return null;
  }
}
