import axios from 'axios';
import { env } from './env';

export const opaClient = {
  async evaluate(policyPath: string, input: object): Promise<any> {
    const response = await axios.post(
      `${env.OPA_URL}/v1/data/${policyPath}`,
      { input },
      { timeout: 5000 }
    );
    return response.data.result;
  },

  async deployPolicy(policyId: string, regoCode: string): Promise<void> {
    await axios.put(
      `${env.OPA_URL}/v1/policies/opengovern_${policyId}`,
      regoCode,
      {
        headers: { 'Content-Type': 'text/plain' },
        timeout: 10_000,
      }
    );
  },

  async deletePolicy(policyId: string): Promise<void> {
    await axios.delete(`${env.OPA_URL}/v1/policies/opengovern_${policyId}`, {
      timeout: 5000,
    });
  },

  async validateRego(regoCode: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      await axios.post(
        `${env.OPA_URL}/v1/compile`,
        { query: regoCode },
        { timeout: 10_000 }
      );
      return { valid: true, errors: [] };
    } catch (err: any) {
      const errors: string[] =
        err.response?.data?.errors?.map((e: any) => e.message as string) ?? [
          'Invalid Rego syntax',
        ];
      return { valid: false, errors };
    }
  },

  async healthCheck(): Promise<boolean> {
    try {
      await axios.get(`${env.OPA_URL}/health`, { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  },
};
