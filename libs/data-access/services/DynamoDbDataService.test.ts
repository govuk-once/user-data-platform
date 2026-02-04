import { describe, beforeEach, it, vi, expect } from 'vitest';
import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { DynamoDbDataService } from './DynamoDbDataService';
import {
  DataInput,
  DynamoDBDataEntity,
  IdentityRecordEntity,
} from '../types/Entity';
import createHttpError from 'http-errors';

describe('DynamoDb Data Service', () => {
  let mockRepository: DynamoDBRepository<DynamoDBDataEntity>;
  let service: DynamoDbDataService;

  const mockResource = 'topics';
  const mockIdentity: IdentityRecordEntity = {
    pk: 'IDENTITY_RECORD#',
    sk: 'mock-service-id/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    serviceId: 'mock-service-id',
    serviceName: 'app',
    udpId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  };

  beforeEach(() => {
    mockRepository = {
      get: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      skBeginswith: vi.fn(),
    } as unknown as DynamoDBRepository<DynamoDBDataEntity>;
    service = new DynamoDbDataService(mockRepository);
  });

  describe('Save', () => {
    it('should successfully save a valid entity', async () => {
      const input: DataInput = {
        data: {test: 'value'},
      };

      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      await service.save(mockIdentity, mockResource, input);

      expect(mockRepository.save).toHaveBeenCalledWith({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: mockResource,
        ...input,
      });
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should save entity with ttl', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const input: DataInput = {
        data: {test: 'value'},
        configuration: {expiresAt: ttl},
      };

      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      await service.save(mockIdentity, mockResource, input);

      expect(mockRepository.save).toHaveBeenCalledWith({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: mockResource,
        data: { test: 'value' },
        ttl,
      });
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should throw a bad request if the identity has no UdpId', async () => {
      const input: DataInput = {
        data: {test: 'value'},
      };

      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      await expect(
        service.save({ ...mockIdentity, udpId: '' }, mockResource, input),
      ).rejects.toThrow(createHttpError.BadRequest);
    });

    it('should throw a bad request if the resource path is not set', async () => {
      const input: DataInput = {
        data: {test: 'value'},
      };

      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      await expect(service.save(mockIdentity, '', input)).rejects.toThrow(
        createHttpError.BadRequest,
      );
    });

    it('should throw an error save fails', async () => {
      const input: DataInput = {
        data: {test: 'value'},
      };

      vi.mocked(mockRepository.save).mockRejectedValue(new Error('Unknown'));

      await expect(
        service.save(mockIdentity, mockResource, input),
      ).rejects.toThrow('Unknown');
    });

    it('should throw error when ttl is negative', async () => {
      const input: DataInput = {
        configuration: {expiresAt: -100},
        data: {status: 'active'},
      };

      await expect(
        service.save(mockIdentity, mockResource, input),
      ).rejects.toThrow(
        'TTL must be a future timestamp in seconds since epoch',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when ttl is a past timestamp', async () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const input: DataInput = {
        configuration: {expiresAt: pastTimestamp},
        data: {status: 'active'},
      };

      await expect(
        service.save(mockIdentity, mockResource, input),
      ).rejects.toThrow(
        'TTL must be a future timestamp in seconds since epoch',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when ttl is current timestamp', async () => {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const input: DataInput = {
        configuration: {expiresAt: nowInSeconds},
        data: {status: 'active'},
      };

      await expect(
        service.save(mockIdentity, mockResource, input),
      ).rejects.toThrow(
        'TTL must be a future timestamp in seconds since epoch',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when ttl is epoch (January 1, 1970)', async () => {
      const input: DataInput = {
        configuration: {expiresAt: 1},
        data: {status: 'active'},
      };

      await expect(
        service.save(mockIdentity, mockResource, input),
      ).rejects.toThrow(
        'TTL must be a future timestamp in seconds since epoch',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Get by keys', () => {
    it('should successfully save a valid entity', async () => {
      const result: DynamoDBDataEntity = {
        pk: 'mock-pk',
        sk: 'mock-sk',
        data: { test: 'value' },
      };

      vi.mocked(mockRepository.get).mockResolvedValue(result);

      const r = await service.getByKey(mockIdentity, mockResource);

      expect(mockRepository.get).toHaveBeenCalledWith({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: mockResource,
      });
      expect(mockRepository.get).toHaveBeenCalledTimes(1);
      expect(r).toEqual(result);
    });

    it('should throw a bad request if the identity has no UdpId', async () => {
      vi.mocked(mockRepository.get).mockResolvedValue(undefined);

      await expect(
        service.getByKey({ ...mockIdentity, udpId: '' }, mockResource),
      ).rejects.toThrow(createHttpError.BadRequest);
    });

    it('should throw a bad request if the resource path is not set', async () => {
      vi.mocked(mockRepository.get).mockResolvedValue(undefined);

      await expect(service.getByKey(mockIdentity, '')).rejects.toThrow(
        createHttpError.BadRequest,
      );
    });

    it('should propogate respoitory errors', async () => {
      vi.mocked(mockRepository.get).mockRejectedValue(new Error('Unknown'));

      await expect(
        service.getByKey(mockIdentity, mockResource),
      ).rejects.toThrow('Unknown');
    });
  });
});
