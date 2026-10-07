import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Gender } from '../data/types';
import { PillsWithOther } from './PillsWithOther';

/** Libellé lisible du genre (profil). undefined = pas encore renseigné. */
export function genderLabel(
  gender?: Gender,
  detail?: string,
): string | undefined {
  if (gender === 'femme') return 'Femme';
  if (gender === 'homme') return 'Homme';
  if (gender === 'autre') return detail?.trim() || 'Autre';
  return undefined;
}

interface Props {
  gender?: Gender;
  /** Précision libre quand « Autre ». */
  detail: string;
  onChange: (gender: Gender, detail: string) => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Femme / Homme + « Autre » avec champ libre visible (règle pastilles).
 * Taper dans le champ = « Autre ».
 */
export function GenderPills({ gender, detail, onChange, compact, style }: Props) {
  return (
    <PillsWithOther<Gender>
      options={[
        { id: 'femme', label: 'Femme' },
        { id: 'homme', label: 'Homme' },
      ]}
      selected={gender === 'autre' ? null : (gender ?? null)}
      onSelect={(g) => onChange(g, '')}
      otherActive={gender === 'autre'}
      otherValue={gender === 'autre' ? detail : ''}
      onPressOther={() => onChange('autre', detail)}
      onChangeOther={(t) => onChange('autre', t)}
      placeholder="ex. non-binaire"
      maxLength={30}
      compact={compact}
      accessibilityLabel="Autre genre"
      style={style}
    />
  );
}
