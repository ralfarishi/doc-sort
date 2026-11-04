import { useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import type { HandoverState, MasterState } from '../types';
import { countUnassignedBucket } from '../utils/logic';

interface UnassignedBucketNoticeProps {
  masterState: MasterState;
  handoverState: HandoverState;
  surveyorsList: string[];
  onReassign: (target: string) => void;
}

/** Shown only while documents sit in the "BELUM DITUGASKAN" bucket; lets the user hand them to a real investigator. */
export const UnassignedBucketNotice: React.FC<UnassignedBucketNoticeProps> = ({
  masterState,
  handoverState,
  surveyorsList,
  onReassign,
}) => {
  const [target, setTarget] = useState('');
  const count = countUnassignedBucket(masterState, handoverState);
  if (count === 0) return null;

  const selected = target || surveyorsList[0] || '';

  return (
    <div className="print:hidden mb-3.5 bg-[#FCF7ED] border border-[#F3E0BD] rounded-2xl p-3.5 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        <WarningCircle size={20} weight="fill" className="text-[#C48A3F] shrink-0" />
        <p className="text-xs text-[#2D2824]">
          <strong>{count} berkas</strong> masih di ordner <strong>Belum Ditugaskan</strong>. Tetapkan investigatornya agar tampil benar di meja dan cetakan.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <select
          value={selected}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Investigator tujuan"
          className="px-2 py-1.5 rounded-xl bg-[#FFFFFF] border border-[#EAE4DC] text-xs font-semibold text-[#2D2824] focus:outline-hidden focus:border-[#D97757]"
        >
          {surveyorsList.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={() => onReassign(selected)}
          disabled={!selected}
          className="px-3 py-1.5 rounded-xl bg-[#D97757] hover:bg-[#C26344] text-white text-xs font-bold transition-colors disabled:opacity-50"
        >
          Tetapkan
        </button>
      </div>
    </div>
  );
};
