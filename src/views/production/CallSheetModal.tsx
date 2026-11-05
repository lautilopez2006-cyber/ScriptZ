import { closeModal } from '../../app/store';
import { t } from '../../i18n';
import { Modal } from '../../ui/kit';
import { CallSheetEditor } from './Production';

export default function CallSheetModal({ dayId }: { dayId: string }) {
  return <Modal title={t('pd.callSheet')} onClose={closeModal} size="xl"><CallSheetEditor dayId={dayId} /></Modal>;
}
