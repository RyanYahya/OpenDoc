import { theme as base } from '../../themes/opendoc-neutral';
import { withDocumentAssets, type DocumentAssets } from 'opendoc/assets';
import assets from './assets.json';

export const theme = withDocumentAssets(base, assets as DocumentAssets);
