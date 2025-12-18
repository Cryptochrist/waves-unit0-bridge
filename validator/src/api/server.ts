import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { Logger } from 'winston';
import { ValidatorConfig } from '../types';
import { Database } from '../services/Database';

/**
 * REST API server for validator monitoring and status
 */
export class ApiServer {
  private app: Express;
  private config: ValidatorConfig;
  private logger: Logger;
  private database: Database;
  private getStatus: () => Promise<any>;
  private server: any = null;

  constructor(
    config: ValidatorConfig,
    logger: Logger,
    database: Database,
    getStatus: () => Promise<any>
  ) {
    this.config = config;
    this.logger = logger;
    this.database = database;
    this.getStatus = getStatus;

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Set up API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Get validator status
    this.app.get('/status', async (req: Request, res: Response) => {
      try {
        const status = await this.getStatus();
        res.json(status);
      } catch (error) {
        this.logger.error('Error getting status:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get statistics
    this.app.get('/stats', async (req: Request, res: Response) => {
      try {
        const stats = await this.database.getStats();
        res.json(stats);
      } catch (error) {
        this.logger.error('Error getting stats:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get pending transfers
    this.app.get('/transfers/pending', async (req: Request, res: Response) => {
      try {
        const transfers = await this.database.getPendingTransfers();
        res.json(
          transfers.map((t) => ({
            transferId: t.transfer.transferId,
            sourceChain: t.transfer.sourceChain,
            destinationChain: t.transfer.destinationChain,
            token: t.transfer.token,
            amount: t.transfer.amount.toString(),
            recipient: t.transfer.recipient,
            status: t.status,
            attestations: t.attestations.length,
            createdAt: t.createdAt,
          }))
        );
      } catch (error) {
        this.logger.error('Error getting pending transfers:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get transfer by ID
    this.app.get('/transfers/:transferId', async (req: Request, res: Response) => {
      try {
        const { transferId } = req.params;
        const transfer = await this.database.getTransfer(transferId);

        if (!transfer) {
          return res.status(404).json({ error: 'Transfer not found' });
        }

        res.json({
          ...transfer,
          transfer: {
            ...transfer.transfer,
            amount: transfer.transfer.amount.toString(),
          },
        });
      } catch (error) {
        this.logger.error('Error getting transfer:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get attestations for a transfer
    this.app.get('/transfers/:transferId/attestations', async (req: Request, res: Response) => {
      try {
        const { transferId } = req.params;
        const attestations = await this.database.getAttestations(transferId);
        res.json(attestations);
      } catch (error) {
        this.logger.error('Error getting attestations:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get all validators
    this.app.get('/validators', async (req: Request, res: Response) => {
      try {
        const validators = await this.database.getAllValidators();
        res.json(validators);
      } catch (error) {
        this.logger.error('Error getting validators:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: any) => {
      this.logger.error('API error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    if (!this.config.apiEnabled) {
      this.logger.info('API server disabled');
      return;
    }

    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.apiPort, () => {
        this.logger.info(`API server listening on port ${this.config.apiPort}`);
        resolve();
      });
    });
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.logger.info('API server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Get Express app instance
   */
  getApp(): Express {
    return this.app;
  }
}
