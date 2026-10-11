import { ReadinessStatus } from '../readiness-status';
import { RequirementReadinessDto } from './project-view.dto';

export class ProjectReadinessDto {
  projectId: number;
  /** The year the assignments were evaluated for. */
  year: number;
  /** READY only when every requirement has additionalNeeded = 0. */
  status: ReadinessStatus;
  requirements: RequirementReadinessDto[];
}
