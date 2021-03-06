import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AccessTokenRepository } from '@ultimatebackend/repository';
import { RpcException } from '@nestjs/microservices';
import { CreateAccessResponse } from '@ultimatebackend/proto-schema/access';
import { CreateAccessCommand } from '../../';
import { NestCasbinService } from 'nestjs-casbin';
import { generateUniqueByte } from '../../../../utitlity';
import { AccessTokenCreatedEvent } from '@ultimatebackend/core';

/**
 * @implements {ICommandHandler<CreateAccessCommand>}
 * @classdesc CQRS command to request password change
 * @class
 */
@CommandHandler(CreateAccessCommand)
export class CreateAccessHandler implements ICommandHandler<CreateAccessCommand> {
  logger = new Logger(this.constructor.name);

  /**
   * @constructor
   * @param tokenRepository
   * @param eventBus
   * @param accessEnforcer
   */
  constructor(
    private readonly tokenRepository: AccessTokenRepository,
    private readonly eventBus: EventBus,
    private readonly accessEnforcer: NestCasbinService,
  ) {

  }

  async execute(command: CreateAccessCommand): Promise<CreateAccessResponse> {
    this.logger.log(`Async ${command.constructor.name}...`);
    const { cmd, user } = command;

    try {
      const resp = await this.tokenRepository.create({
        createdBy: user.id,
        active: true,
        token: await generateUniqueByte(),
        name: cmd.name,
        scopes: cmd.scopes,
        tenantId: cmd.tenantId,
      });

      for (const scope of cmd.scopes) {
        const objs = scope.split('_');
        await this.accessEnforcer.addPolicy(resp.token, resp.tenantId, objs[1], objs[0]);
      }

      /*  Publish to the event store of our newly created access token */
      await this.eventBus.publish(new AccessTokenCreatedEvent(resp));

      return {
        // @ts-ignore
        accessToken: {
          ...resp,
        },
      };
    } catch (e) {
      throw new RpcException(e);
    }
  }
}
